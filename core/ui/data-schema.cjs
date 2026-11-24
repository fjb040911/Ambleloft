const resultStates = Object.freeze(['ready', 'empty', 'incomplete', 'failed', 'uninitialized']);

const uiDataSchema = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: resultStates,
      description: 'Result card state. For a finished review with findings, use ready or omit state.',
    },
    values: {type: 'object'},
    rows: {type: 'array', items: {type: 'object'}, maxItems: 500},
    summary: {type: 'string', maxLength: 4000},
    coverage: {type: 'string', maxLength: 4000},
    baseline: {type: 'object'},
  },
  required: ['rows'],
  additionalProperties: false,
};

module.exports = {resultStates, uiDataSchema};
