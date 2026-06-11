import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Distribution,
  ViewerProtocolPolicy,
  AllowedMethods,
  CachedMethods,
  PriceClass,
  ResponseHeadersPolicy,
  HeadersFrameOption,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';

/**
 * W2 m2-2 piece-4. Fronts `codearena-public-data-<account>` with a
 * CloudFront distribution. The bucket stays Block-Public-Access-enabled;
 * CloudFront is the only public read path.
 *
 * Uses the legacy S3Origin + Origin Access Identity (OAI) pattern.
 * S3BucketOrigin.withOriginAccessControl() lands in CDK ~2.170+; the
 * pinned 2.155.0 in this repo doesn't have it. OAI is still fully
 * supported by AWS and is bucket-policy-restricted to the OAI principal;
 * upgrading to OAC is a v1.5 follow-up.
 *
 * Custom domain hookup is deferred to m4-0 - v1 ships on the
 * `*.cloudfront.net` default domain.
 *
 * Per [[feedback-aws-account-boundary]] TIER 3: codearena-* resources only,
 * Project=CoderCup ManagedBy=ClaudeCode tags applied via Tags.of(app).
 */
export interface CodeArenaPublicCdnStackProps extends StackProps {
  publicDataBucket: Bucket;
}

export class CodeArenaPublicCdnStack extends Stack {
  public readonly distribution: Distribution;
  public readonly distributionDomainName: string;

  constructor(
    scope: Construct,
    id: string,
    props: CodeArenaPublicCdnStackProps,
  ) {
    super(scope, id, props);

    // CORS + cache-control headers. Cache-Control mirrors what the
    // Publisher Lambda sets on each PUT; including it here as a non-
    // override default keeps the contract explicit.
    const responseHeadersPolicy = new ResponseHeadersPolicy(
      this,
      'CodeArenaCdnHeaders',
      {
        responseHeadersPolicyName: 'codearena-public-cdn-headers',
        corsBehavior: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: ['*'],
          accessControlAllowMethods: ['GET', 'HEAD'],
          accessControlAllowOrigins: [
            'https://main.d2wicurs2ws3dd.amplifyapp.com',
            'https://*.amplifyapp.com',
            'http://localhost:3000',
          ],
          accessControlMaxAge: Duration.seconds(60),
          originOverride: true,
        },
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Cache-Control',
              value: 'public, max-age=60, s-maxage=60',
              override: false,
            },
          ],
        },
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: HeadersFrameOption.DENY,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
        },
      },
    );

    this.distribution = new Distribution(this, 'CodeArenaPublicCdn', {
      comment: 'codearena-public-cdn',
      defaultBehavior: {
        origin: new S3Origin(props.publicDataBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        responseHeadersPolicy,
      },
      priceClass: PriceClass.PRICE_CLASS_100,
      enabled: true,
      enableLogging: false,
    });

    this.distributionDomainName = this.distribution.distributionDomainName;

    new CfnOutput(this, 'PublicCdnDomain', {
      value: this.distribution.distributionDomainName,
      description:
        'CloudFront-issued domain serving codearena-public-data via OAC. ' +
        'Wire as NEXT_PUBLIC_DATA_CDN_BASE in Amplify env vars (m4-0).',
    });
    new CfnOutput(this, 'PublicCdnDistributionId', {
      value: this.distribution.distributionId,
      description:
        'For Publisher Lambda CreateInvalidation calls (m2-2 piece-3).',
    });
  }
}
