import { Global, Module, type Provider } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@tteeka/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

const appConfigProvider: Provider<AppConfig> = {
  provide: APP_CONFIG,
  useFactory: () => loadConfig(process.env),
};

@Global()
@Module({
  providers: [appConfigProvider],
  exports: [APP_CONFIG],
})
export class ConfigurationModule {}
