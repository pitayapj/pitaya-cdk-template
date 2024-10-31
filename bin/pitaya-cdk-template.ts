#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';

import { env } from '../lib/parameters/constants';
import { DevelopmentStage } from '../lib/stages/dev';
import { ProductionStage } from '../lib/stages/prod';

const app = new App();

// const deployEnv = app.node.tryGetContext("deployEnv");
// if (deployEnv == undefined)
//   throw new Error(`Please specify environment with context option. ex) cdk deploy -c deployEnv=dev`);
// if (deployEnv !== "dev" && deployEnv !== "stg" && deployEnv !== "prod")
//   throw new Error('Invalid environment. Only accept dev, stg or prod');

const devStage = new DevelopmentStage(app, "Development", {
  env: env,
});
Tags.of(devStage).add("env","dev");

const prodStage = new ProductionStage(app, "Production", {
  env: env
});
Tags.of(devStage).add("env","prod");