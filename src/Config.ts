import convict from 'convict'

const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'sandbox', 'development'],
    default: 'sandbox',
    env: 'NODE_ENV',
  },
  settings: {
    baseUrl: {
      doc: 'base url path of the Stripe api',
      default: 'https://api.stripe.com',
    },
    secretAPIKey: {
      doc: 'Secret API Key',
      default: '',
    },
    publicAPIKey: {
      doc: 'Public API Key',
      default: '',
    },
  },
})

const env = config.get('env')
const settingsName = env === 'production' ? env : 'sandbox'

config.loadFile(`./settings/${settingsName}.json`)
config.validate({ allowed: 'strict' })

export default config
