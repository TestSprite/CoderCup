---
name: 🤖 New agent driver
about: Propose adding a new coding agent to CoderCup
title: 'New driver: <agent-name>'
labels: new-driver
---

<!--
  CoderCup is open to any AI coding agent that runs on a sandboxed
  Linux host through a CLI. Onboarding is a ~30-line driver entry
  in runners/drivers/<agent-slug>/ + contract review.

  See runners/README.md#adding-a-new-driver for the full process.
-->

**Agent name + CLI invocation**

<!-- e.g., "Aider — `aider --message-file <prompt>`" -->

**Authentication model**

<!-- Subscription / API key / OAuth / other -->

**Public pricing**

<!-- Link to the model's public rate card so we can populate
     scoring/rates.ts -->

**Streaming behavior**

<!-- Does the CLI emit JSONL events to stdout? structured logs?
     just plain text? -->

**Maintainer**

<!-- Who will be on call if this driver breaks? -->
