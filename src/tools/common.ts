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
import { defineTabTool, defineTool } from './tool.js';
import { createSchemaWithProjectIsolation, getProjectIsolationErrorMessage, validateProjectIsolationParams } from '../projectIsolation.js';

const close = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_close',
    title: 'Close browser',
    description: 'Close the page',
    inputSchema: createSchemaWithProjectIsolation({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    // 验证项目隔离参数
    if (!validateProjectIsolationParams(params))
      throw new Error(getProjectIsolationErrorMessage(!!context.config.projectIsolation));


    // 处理项目信息（仅在首次调用时）
    if (params.projectDrive && params.projectPath) {
      context.setProjectInfo({
        projectDrive: params.projectDrive,
        projectPath: params.projectPath,
      });
    }

    await context.closeBrowserContext();
    response.setIncludeTabs();
    response.addCode(`await page.close()`);
  },
});

const resize = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_resize',
    title: 'Resize browser window',
    description: 'Resize the browser window',
    inputSchema: z.object({
      width: z.number().describe('Width of the browser window'),
      height: z.number().describe('Height of the browser window'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    response.addCode(`await page.setViewportSize({ width: ${params.width}, height: ${params.height} });`);

    await tab.waitForCompletion(async () => {
      await tab.page.setViewportSize({ width: params.width, height: params.height });
    });
  },
});

export default [
  close,
  resize
];
