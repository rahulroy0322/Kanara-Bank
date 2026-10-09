import 'dotenv/config'
import Joi from 'joi'

const ENV_CONSTS = ['DEV', 'DEBUG', 'TEST', 'PROD'] as const

const envValues = new Intl.ListFormat('en', {
  style: 'long',
  type: 'disjunction',
}).format(ENV_CONSTS)

const envSchema = Joi.object({
  PORT: Joi.number().port().default(2000).messages({
    'number.base': 'PORT must be a number',
    'number.port': 'PORT must be a valid port number (1-65535)',
  }),
  ENV: Joi.string()
    .valid(...ENV_CONSTS)
    .default('DEV')
    .messages({
      'string.empty': 'ENV is required',
      'any.required': 'ENV is required',
      'any.only': `ENV must be one of ${envValues}`,
    }),
}).unknown()

const { value, error } = envSchema.validate(process.env, { abortEarly: false })

if (error) {
  throw error
}

const env = {
  PORT: value.PORT as number,
  ENV: value.ENV as string,
}

export { env }
