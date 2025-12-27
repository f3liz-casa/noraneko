<!--
SPDX-License-Identifier: MPL-2.0
-->

# @nora/core

When build, placed on noraneko/content

This component handles almost all of Noraneko's core code.

## Directory Structure

common/

- main codes
- supports hot reload
- **common/tmp/** - Non-migrated modules from 0.2.0 migration (not loaded as features)

static/

- codes that can't be hot-reloaded

nora/

- codes that requires noraneko-runtime (esp. cpp patch)
- should be disabled easily for other-runtime

utils/

- Utilities that helps you to code comfortable.
- It is preferred that single file but folder with index.ts can be in.

example/

- as test and template for basic codes

experiment/

- Experimental/temporary code not ready for production
- Contains prototypes and work-in-progress features
