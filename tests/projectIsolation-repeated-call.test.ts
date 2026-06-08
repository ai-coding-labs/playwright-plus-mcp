/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Reproduction test for projectIsolation repeated-validation bug.
 *
 * Bug: After browser_navigate sets projectInfo via setProjectInfo(),
 * subsequent tool calls like browser_snapshot fail with
 * "Project isolation is enabled but required parameters are missing"
 * because they re-validate raw params instead of checking stored context.
 *
 * Fix: `!!context.getProjectInfo() || validateProjectIsolationParamsWithConfig(...)`
 */

import assert from 'node:assert';
import {
  validateProjectIsolationParamsWithConfig,
  getProjectIsolationErrorMessage,
} from '../src/projectIsolation.js';
import type { ProjectInfo } from '../src/projectIsolation.js';

interface MockContext {
  getProjectInfo(): ProjectInfo | undefined;
  setProjectInfo(info: ProjectInfo): void;
  config: { projectIsolation?: boolean };
}

function createMockContext(initialProjectInfo?: ProjectInfo): MockContext {
  let projectInfo = initialProjectInfo;
  return {
    getProjectInfo: () => projectInfo,
    setProjectInfo: (info: ProjectInfo) => {
      if (!projectInfo) {
        projectInfo = info;
      }
    },
    config: { projectIsolation: true },
  };
}

function checkProjectIsolation(context: MockContext, params: Record<string, any>): void {
  const hasProjectInfo =
    !!context.getProjectInfo() ||
    validateProjectIsolationParamsWithConfig(params, !!context.config.projectIsolation);
  if (!hasProjectInfo) {
    throw new Error(getProjectIsolationErrorMessage(!!context.config.projectIsolation));
  }
}

function storeProjectInfo(context: MockContext, params: Record<string, any>): void {
  if (params.projectDrive && params.projectPath) {
    context.setProjectInfo({
      projectDrive: params.projectDrive,
      projectPath: params.projectPath,
    });
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err: any) {
    failed++;
    throw new Error(`FAIL: ${name}\n  ${err.message}`);
  }
}

// 1. Happy path
// getProjectInfo returns a valid object → params are not re-validated
test('happy path: existing projectInfo, no params in second call', () => {
  const context = createMockContext({
    projectDrive: '/',
    projectPath: '/home/user/my-project',
  });

  assert.doesNotThrow(() => checkProjectIsolation(context, {}));
});

// 2. Regression
// getProjectInfo returns undefined and no params → must throw
test('regression: no projectInfo and no params → throws', () => {
  const context = createMockContext(undefined);

  assert.throws(
      () => checkProjectIsolation(context, {}),
      (err: any) =>
        err instanceof Error &&
        err.message.includes('Project isolation parameters are required but missing.'),
      'Expected error message to contain "Project isolation parameters are required but missing."'
  );
});

// 3. With params
// getProjectInfo exists, params also provided → no throw
test('with params: existing projectInfo plus valid params → no throw', () => {
  const context = createMockContext({
    projectDrive: '/',
    projectPath: '/home/user/my-project',
  });

  const params = {
    projectDrive: '/',
    projectPath: '/home/user/another-project',
  };

  assert.doesNotThrow(() => checkProjectIsolation(context, params));
});

// 4. Once-only
// First call stores projectInfo A; second call with params B is silently ignored
test('once-only: second call params are silently ignored', () => {
  const context = createMockContext(undefined);

  const paramsA = {
    projectDrive: '/',
    projectPath: '/home/user/project-a',
  };
  checkProjectIsolation(context, paramsA);
  storeProjectInfo(context, paramsA);
  assert.strictEqual(context.getProjectInfo()?.projectPath, '/home/user/project-a');

  const paramsB = {
    projectDrive: 'C:',
    projectPath: 'C:\\Users\\dev\\project-b',
  };
  checkProjectIsolation(context, paramsB);
  storeProjectInfo(context, paramsB);

  const stored = context.getProjectInfo();
  assert.ok(stored);
  assert.strictEqual(
      stored!.projectPath,
      '/home/user/project-a',
      'Project info should remain from first call (once-only behavior)'
  );
});

if (failed > 0) {
  process.exit(1);
}
