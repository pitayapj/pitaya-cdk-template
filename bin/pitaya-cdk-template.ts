#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';

import { env } from '../lib/parameters/constants';
import { AppStage } from '../lib/stages/app-stage';

const app = new App();

const infraStatus = app.node.tryGetContext("infraStatus") != undefined ? app.node.tryGetContext("infraStatus") : "on"; 
if (infraStatus !== "on" && infraStatus !== "off") 
  throw new Error('Invalid infra status. Only accept on or off');

// All environments' prefix. This will be supply to resources' name.
const devEnv = "dev";
const stgEnv = "stg";
const prodEnv = "prod";

const devStage = new AppStage(app, "Development", {
  env: env,
  deployEnv: devEnv,
  infraStatus: infraStatus
});
Tags.of(devStage).add("env", devEnv);

const prodStage = new AppStage(app, "Production", {
  env: env,
  deployEnv: prodEnv,
  infraStatus: "on"
});
Tags.of(prodStage).add("env", prodEnv);