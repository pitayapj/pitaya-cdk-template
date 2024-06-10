#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { BaseNetworkStack } from '../lib/base-network';
import { StatefulResourceStack } from '../lib/stateful-resources';
import { StatelessResourceStack } from '../lib/stateless-resources';
import { env } from '../lib/parameters/constants';
import { resolveConfig } from '../lib/parameters/env-config';

const app = new App();

const deployEnv = app.node.tryGetContext("deployEnv");
if (deployEnv == undefined)
  throw new Error(`Please specify environment with context option. ex) cdk deploy -c deployEnv=dev`);
if (deployEnv !== "dev" && deployEnv !== "stg" && deployEnv !== "prod") 
  throw new Error('Invalid environment. Only accept dev, stg or prod');

// Get config from .env.${deployEnv} files
const config = resolveConfig(deployEnv);
// Some parameter might need user to define, in that case uncomment below code
// if (!config.domainName) {
//   throw new Error(`Missing required DOMAIN_NAME in .env file, please include it in .env.${deployEnv} file.` );
// }


/**
 * First, the base network stack
 * Base network included VPC and its config.
 * VPC properties could be changed, but not the VPC itself,
 * VPC itself should not be delete and should be available till the end of project life cycle.
 * Should be things that's free
 *  */ 
const baseNetworkStack = new BaseNetworkStack(app, 'BaseNetwork', {
  stackName: `${deployEnv}-BaseNetwork`,
  env: env,
  deployEnv: deployEnv,
  config
});

/**
 * The stateFUL stack
 * Stateful stack should be things that will retain data.
 * Most of the time should just be AWS RDS databases.
 * Delete protection should be on for production and off otherwise.
 *  */ 
const statefulResourceStack = new StatefulResourceStack(app, 'StatefulResource', {
  stackName: `${deployEnv}-StatefulResource`,
  env: env,
  deployEnv: deployEnv,
  vpc: baseNetworkStack.vpc, //reference resource from difference stack can make stack interlock, so be careful!
});
statefulResourceStack.addDependency(baseNetworkStack);


/**
 * The stateLESS stack
 * Stateless resources is something can be deleted/recreate without affecting the project's data.
 * According to AWS Best practice of CDK, you should put every resources into 1 file/stack.
 * https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
 * This stack should included everything else other than VPC and stateful resources.
 * Load Balancer, EC2, ECS, Lambda, Code Pipeline, etc..
 * If you have too many lambda functions, you can write in into a difference file.
 *  */ 
const statelessResourceStack = new StatelessResourceStack(app, 'StatelessResource', {
  stackName: `${deployEnv}-StatelessResource`,
  env: env,
  deployEnv: deployEnv,
  vpc: baseNetworkStack.vpc,
  config: config
});
statelessResourceStack.addDependency(baseNetworkStack);
