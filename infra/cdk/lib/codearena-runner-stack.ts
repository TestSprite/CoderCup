import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Vpc,
  SubnetType,
  Instance,
  InstanceType,
  InstanceClass,
  InstanceSize,
  MachineImage,
  AmazonLinuxCpuType,
  SecurityGroup,
  Peer,
  BlockDeviceVolume,
  EbsDeviceVolumeType,
  UserData,
} from 'aws-cdk-lib/aws-ec2';
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  PolicyStatement,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Table } from 'aws-cdk-lib/aws-dynamodb';

/**
 * W2 runner host for CoderCup. Provisions ONE persistent EC2 that hosts all
 * three agent CLIs (claude, codex, antigravity). The operator connects via
 * SSM Session Manager once per agent to run the account-login flow; subscription
 * sessions persist on disk. The driver scripts then invoke each CLI headlessly.
 *
 * Auth model: NO inbound SSH port. NO API keys in Secrets Manager. The operator
 * connects via `aws ssm start-session --target <instance-id> --region us-east-1`,
 * which is IAM-authenticated and audit-logged in CloudTrail. The instance has
 * the SSM agent baked into Amazon Linux 2023 and the IAM role grants ssmmessages
 * (via AmazonSSMManagedInstanceCore).
 *
 * Sized t3.large for the launch period (4 vCPU / 8 GiB) — single 4h Claude Code
 * session is well within budget. Stop-and-start in steady state to drop the
 * monthly bill (~$60/mo → ~$10/mo on weekday-only).
 *
 * Resources read/written by drivers (cross-stack references from
 * CodeArenaDataStack):
 *   - codearena-runs S3 bucket: drivers write manifests, logs, transcripts
 *   - codearena-public-data S3 bucket: drivers write live JSONL streams that the
 *     dashboard tails for the "live broadcast" UI
 *   - codearena-main DynamoDB: drivers do NOT write directly; scoring Lambda
 *     owns DDB. The driver just produces the manifest.
 *
 * IAM is least-privilege scoped to ARNs matching the codearena-* prefix.
 */
export interface CodeArenaRunnerStackProps extends StackProps {
  publicDataBucket: Bucket;
  runsBucket: Bucket;
  mainTable: Table;
}

export class CodeArenaRunnerStack extends Stack {
  public readonly instance: Instance;

  constructor(scope: Construct, id: string, props: CodeArenaRunnerStackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'CodeArenaRunnerVpc', {
      vpcName: 'codearena-runner-vpc',
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const securityGroup = new SecurityGroup(this, 'CodeArenaRunnerSG', {
      vpc,
      securityGroupName: 'codearena-runner-sg',
      description:
        'Outbound only. Inbound deliberately empty - access via SSM Session Manager.',
      allowAllOutbound: true,
    });

    const role = new Role(this, 'CodeArenaRunnerRole', {
      roleName: 'codearena-runner-role',
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      description:
        'Runner EC2 role. SSM Session Manager + read/write on codearena-* S3 and DDB.',
    });

    role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );

    props.runsBucket.grantReadWrite(role);
    props.publicDataBucket.grantReadWrite(role);

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'cloudwatch:namespace': 'CoderCup/Runner' },
        },
      }),
    );

    // Drivers explicitly invoke codearena-score-runner after they PUT
    // a manifest to S3 (the S3-PUT-trigger path causes a cyclic CFN
    // reference; see codearena-compute-stack.ts). Wildcard on codearena-
    // function names so this stack doesn't take an explicit cross-stack
    // ref to ComputeStack.
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:us-east-1:${this.account}:function:codearena-*`,
        ],
      }),
    );

    // Drivers provision a per-run Amplify app (CreateApp + CreateBranch
    // + StartJob) and clean up via DeleteApp. Tag-conditional resource
    // scoping is awkward on Amplify because the app id is unknown at
    // CreateApp time; v1 narrows by region + account instead, and the
    // driver tags every CreateApp with Project=CoderCup +
    // ManagedBy=ClaudeCode + AgentSlug + RunId for accounting.
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'amplify:CreateApp',
          'amplify:CreateBranch',
          'amplify:CreateDeployment',
          'amplify:StartJob',
          'amplify:StartDeployment',
          'amplify:GetApp',
          'amplify:GetBranch',
          'amplify:GetJob',
          'amplify:ListApps',
          'amplify:ListBranches',
          'amplify:ListJobs',
          'amplify:DeleteApp',
          'amplify:DeleteBranch',
          'amplify:DeleteJob',
          'amplify:TagResource',
          'amplify:UntagResource',
        ],
        resources: [`arn:aws:amplify:us-east-1:${this.account}:*`],
      }),
    );

    // Drivers read codearena/github-pat + codearena/testsprite-api-key
    // from Secrets Manager at runtime.
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:us-east-1:${this.account}:secret:codearena/*`,
        ],
      }),
    );

    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/codearena/*`,
        ],
      }),
    );

    const userData = UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf update -y',
      'dnf install -y git jq tar gzip ca-certificates which',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'dnf install -y nodejs',
      'npm install -g pnpm@9',
      'dnf install -y https://github.com/cli/cli/releases/download/v2.55.0/gh_2.55.0_linux_amd64.rpm',
      'mkdir -p /opt/codearena',
      'chown ec2-user:ec2-user /opt/codearena',
      'echo "export PATH=/usr/local/bin:/usr/bin:/bin:/opt/codearena/bin" >> /home/ec2-user/.bashrc',
      'echo "CoderCup runner provisioned $(date -Iseconds)" > /opt/codearena/PROVISIONED',
      'mkdir -p /home/ec2-user/.codearena',
      'chown -R ec2-user:ec2-user /home/ec2-user/.codearena',
    );

    this.instance = new Instance(this, 'CodeArenaRunnerInstance', {
      instanceName: 'codearena-runner',
      vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.LARGE),
      machineImage: MachineImage.latestAmazonLinux2023({
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      securityGroup,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: BlockDeviceVolume.ebs(100, {
            volumeType: EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
      requireImdsv2: true,
    });

    new CfnOutput(this, 'RunnerInstanceId', {
      value: this.instance.instanceId,
      description: 'Use with: aws ssm start-session --target <id> --region us-east-1',
    });
    new CfnOutput(this, 'RunnerSsmCommand', {
      value: `aws ssm start-session --target ${this.instance.instanceId} --region ${this.region}`,
      description: 'Copy-paste to open a shell on the runner. No SSH key needed.',
    });
    new CfnOutput(this, 'RunnerLoginInstructions', {
      value:
        'Once connected: (1) sudo -iu ec2-user; (2) npm i -g @anthropic-ai/claude-code @openai/codex; (3) curl -sSL <antigravity-cli-url> | sh; (4) run "claude login", "codex login", "antigravity login" once each. Sessions persist in /home/ec2-user/.config.',
      description: 'Manual one-time setup steps after first deploy',
    });
  }
}
