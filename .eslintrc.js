module.exports = {
	root: true,
	env: {
		commonjs: true,
		node: true,
		mocha: true,
	},
	extends: 'airbnb-base',
	parserOptions: {
		ecmaVersion: 2022,
	},
	rules: {
		'no-tabs': 0,
		indent: [
			'error',
			'tab',
		],
		'no-param-reassign': [
			'error',
			{
				props: false,
			},
		],
		'consistent-return': 0,
		'max-len': 0,
		'import/extensions': [
			'error',
			{
				mjs: 'always',
				js: 'never',
			},
		],
	},
};
