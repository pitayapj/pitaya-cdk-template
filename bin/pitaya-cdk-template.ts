#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BaseNetworkStack } from '../lib/base-network';
import { StatefulResourceStack } from '../lib/stateful-resources';
import { env } from '../lib/parameters/constants';
import { resolveConfig } from '../lib/parameters/env-config';

const app = new cdk.App();

const deployEnv = app.node.tryGetContext("deployEnv");
if (deployEnv == undefined)
  throw new Error(`Please specify environment with context option. ex) cdk deploy -c deployEnv=dev`);
if (deployEnv != "dev" || deployEnv != "stg" || deployEnv != "prod") throw new Error('Invalid environment.');

// Get config from .env.${deployEnv} files
const config = resolveConfig(deployEnv);

// First, the base stack.
const baseNetworkStack = new BaseNetworkStack(app, `${deployEnv}-BaseNetWork`, {
  env: env,
  deployEnv: deployEnv,
  config
});

const statefulResourceStack = new StatefulResourceStack(app, `${deployEnv}-StatefulResource`, {
  env: env,
  deployEnv: deployEnv,
  vpc: baseNetworkStack.vpc, //reference resource from difference stack can make resource interlock, so be careful!
  //if config is needed, add it in the file 
});
