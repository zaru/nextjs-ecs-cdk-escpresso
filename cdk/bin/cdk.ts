#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NextJsStack } from "../lib/next-js-stack";
import { Config, stages } from "../lib/utils";

const app = new cdk.App();
for (const stage of stages) {
	const config = new Config(stage);
	new NextJsStack(app, config.genId(), {});
}
