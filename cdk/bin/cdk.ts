#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NextJsStack } from "../lib/next-js-stack";
import { Config, stages } from "../lib/utils";

const app = new cdk.App();
const envKey = app.node.tryGetContext("environment");
if (!stages.includes(envKey)) {
  throw new Error(`environment must be one of ${stages.join(", ")}`);
}
const config = new Config(envKey);
new NextJsStack(app, config.genId(), {
  // Availability zoneを3つ以上指定するにはアカウントとリージョンを指定する必要がある
  // この環境変数はAWSプロファイルが設定されている場合は自動でセットされる
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
