import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Generation and static validation do not need a live database URL. Runtime
  // processes continue to require and validate DATABASE_URL via @tteeka/config.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
