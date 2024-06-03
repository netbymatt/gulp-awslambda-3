import {
	LambdaClient, GetAliasCommand, GetFunctionConfigurationCommand,
	UpdateFunctionCodeCommand, CreateFunctionCommand, UpdateFunctionConfigurationCommand,
	CreateAliasCommand, UpdateAliasCommand,
} from '@aws-sdk/client-lambda';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import through from 'through2';
import PluginError from 'plugin-error';
import log from 'fancy-log';
import colors from 'ansi-colors';
import checkLambdaStatus from 'gulp-awslambda-3-status';

const DEFAULT_OPTS = {
	profile: null,
	region: 'us-east-1',
	retryCount: 10,
	statusVerbose: false,
};

const DEFAULT_PARAMS = {
	Handler: 'index.handler',
	Runtime: 'nodejs20.x',
};

// add the plugin name to the error formatter
const makeErr = (message) => new PluginError('gulp-awslambda-3', message);

const updateFunctionCode = async (lambda, name, upload, params, opts) => {
	await checkLambdaStatus(name, lambda, opts.retryCount, opts.statusVerbose);
	delete params.Runtime;
	const code = params.Code || { ZipFile: upload.contents };
	return lambda.send(new UpdateFunctionCodeCommand({
		FunctionName: name,
		...code,
		Publish: opts.publish || false,
	}));
};

const createFunction = (lambda, name, upload, params, opts) => {
	params.Code = params.Code || { ZipFile: upload.contents };
	return lambda.send(new CreateFunctionCommand({
		...DEFAULT_PARAMS,
		Publish: opts.publish || false,
		...params,
	}));
};

const upsertAlias = async (operation, lambda, functionName, functionVersion, alias, aliasDesc, retryCount, statusVerbose) => {
	await checkLambdaStatus(functionName, lambda, retryCount, statusVerbose);
	const params = {
		FunctionName: functionName,
		FunctionVersion: functionVersion,
		Name: alias,
		Description: aliasDesc,
	};
	// get command
	let Command = UpdateAliasCommand;
	if (operation === 'create') Command = CreateAliasCommand;
	try {
		await lambda.send(new Command(params));
		log(`${operation}d alias ${colors.magenta(alias)} for version ${colors.magenta(functionVersion)}`);
	} catch (err) {
		log(`Could not ${operation} alias ${alias}:${err}`);
	}
};

// the core publishing functionality
const publisher = (params, _opts) => {
	// combine options
	const opts = { ...DEFAULT_OPTS, ..._opts };

	// construct client options
	const clientOptions = {
		region: opts.region,
	};
	// add credentials if profile is provided
	if (opts.profile !== null) {
		clientOptions.credentials = fromIni({ profile: opts.profile });
	}

	// create a client
	const lambdaClient = new LambdaClient(clientOptions);

	// create or update the alias
	const updateOrCreateAlias = async (response) => {
		if (opts.publish && opts.alias) {
			let operation = 'update';
			try {
				// get the existing alias
				await lambdaClient.send(new GetAliasCommand({
					FunctionName: params.FunctionName,
					Name: opts.alias.name,
				}));
			} catch (err) {
				// change to create if no alias found
				operation = 'create';
			} finally {
				// update the new alias
				await upsertAlias(
					operation,
					lambdaClient,
					params.FunctionName,
					(opts.alias.version || response.Version).toString(),
					opts.alias.name,
					opts.alias.description,
					opts.retryCount,
					opts.statusVerbose,
				);
			}
		}
	};

	// print the version of the function
	const printVersion = (response) => {
		if (opts.publish) {
			log(`Publishing Function Version: ${colors.magenta(response.FunctionName)}:${colors.magenta(response.Version)}`);
		}
	};

	// success of upload or create transitions to creating an alias
	const successful = (response) => {
		printVersion(response);
		return updateOrCreateAlias(response);
	};

	let toUpload;

	const transform = (file, enc, cb) => {
		// no file provided, don't do anything
		if (file.isNull()) {
			return cb();
		}
		// streams not supported
		if (file.isStream()) {
			return cb(makeErr('Streaming is not supported'));
		}

		// store the file to upload
		toUpload = file;

		// work is done in the flush function
		cb();
	};

	async function flush(cb) {
		// confirm data to upload
		if (!toUpload && (!params.Code)) {
			return cb(makeErr('No code provided'));
		}
		if (toUpload && toUpload.path.slice(-4) !== '.zip') {
			return cb(makeErr('Provided file is not a ZIP'));
		}
		// confirm parameters
		if (opts.alias) {
			if (!opts.alias.name) {
				return cb(makeErr(`Alias requires a ${colors.red('name')} parameter`));
			} if (!(typeof opts.alias.name === 'string')) {
				return cb(makeErr(`Alias ${colors.red('name')} must be a string`));
			}
		}

		log(`Uploading Lambda function "${params.FunctionName}"...`);

		// store stream for chaining on done
		const stream = this;

		// handle done and erros
		const done = (err) => {
			if (err) {
				return cb(makeErr(err.message));
			}
			// report success and allow chaining
			log(`Lambda function "${params.FunctionName}" successfully uploaded`);
			stream.push(toUpload);
			cb();
		};

		try {
			// get existing parameters
			const existingParams = await lambdaClient.send(new GetFunctionConfigurationCommand({
				FunctionName: params.FunctionName,
			}));
			// combine new parameters with existing
			const newParams = { ...params };
			newParams.Description = params.Description ?? existingParams?.Description;
			newParams.FunctionName = params.FunctionName ?? existingParams?.FunctionName;
			newParams.Handler = params.Handler ?? existingParams?.Handler;
			newParams.MemorySize = params.MemorySize ?? existingParams?.MemorySize;
			newParams.Role = params.Role ?? existingParams?.Role;
			newParams.Runtime = params.Runtime ?? existingParams?.Runtime;
			newParams.Timeout = params.Timeout ?? existingParams?.Timeout;
			newParams.Architecures = params.Architecures ?? existingParams?.Architecures;

			// update because existing parameters were returned
			try {
				// update the function
				const result = await updateFunctionCode(lambdaClient, params.FunctionName, toUpload, params, opts);
				// success updates aliases
				await successful(result);
				// wait for alias updates complete
				await checkLambdaStatus(params.FunctionName, lambdaClient, opts.retryCount, opts.statusVerbose);
				await lambdaClient.send(new UpdateFunctionConfigurationCommand(newParams, done));
				done();
			} catch (err) {
				// error updating function
				done(err);
			}
		} catch (err) {
			// existing parameters not found, we're uploading a new function
			try {
				// Creating a function
				const result = await createFunction(lambdaClient, params.FunctionName, toUpload, params, opts);
				await successful(result);
				// wait for alias updates complete
				await checkLambdaStatus(params.FunctionName, lambdaClient, opts.retryCount, opts.statusVerbose);
				done();
			} catch (err2) {
				// error with uploading
				done(err2);
			}
		}
	}

	// return the stream function
	return through.obj(transform, flush);
};

export default publisher;
