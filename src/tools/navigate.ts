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

import { z } from 'zod';
import { defineTool, defineTabTool } from './tool.js';
import { createSchemaWithProjectIsolation, validateProjectIsolationParamsWithConfig, getProjectIsolationErrorMessage } from '../projectIsolation.js';

const navigate = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_navigate',
    title: 'Navigate to a URL',
    description: 'Navigate to a URL',
    inputSchema: createSchemaWithProjectIsolation({
      url: z.string().describe('The URL to navigate to'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    // 验证项目隔离参数
    const hasProjectInfo = !!context.getProjectInfo() || validateProjectIsolationParamsWithConfig(params, !!context.config.projectIsolation);
    if (!hasProjectInfo)
      throw new Error(getProjectIsolationErrorMessage(!!context.config.projectIsolation));


    // 处理项目信息（仅在首次调用时）
    if (params.projectDrive && params.projectPath) {
      context.setProjectInfo({
        projectDrive: params.projectDrive,
        projectPath: params.projectPath,
      });
    }

    const tab = await context.ensureTab();
    await tab.navigate(params.url);

    response.setIncludeSnapshot();
    response.addCode(`await page.goto('${params.url}');`);
  },
});

const goBack = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_back',
    title: 'Go back',
    description: 'Go back to the previous page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    await tab.page.goBack();
    response.setIncludeSnapshot();
    response.addCode(`await page.goBack();`);
  },
});

const goForward = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_forward',
    title: 'Go forward',
    description: 'Go forward to the next page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    await tab.page.goForward();
    response.setIncludeSnapshot();
    response.addCode(`await page.goForward();`);
  },
});

export default [
  navigate,
  goBack,
  goForward,
];
