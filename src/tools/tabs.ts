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
import { defineTool } from './tool.js';
import { createSchemaWithProjectIsolation, getProjectIsolationErrorMessage, validateProjectIsolationParams } from '../projectIsolation.js';

const listTabs = defineTool({
  capability: 'core-tabs',

  schema: {
    name: 'browser_tab_list',
    title: 'List tabs',
    description: 'List browser tabs',
    inputSchema: createSchemaWithProjectIsolation({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    // 验证项目隔离参数
    const hasProjectInfo = !!context.getProjectInfo() || validateProjectIsolationParams(params);
    if (!hasProjectInfo)
      throw new Error(getProjectIsolationErrorMessage(!!context.config.projectIsolation));


    // 处理项目信息（仅在首次调用时）
    if (params.projectDrive && params.projectPath) {
      context.setProjectInfo({
        projectDrive: params.projectDrive,
        projectPath: params.projectPath,
      });
    }

    await context.ensureTab();
    response.setIncludeTabs();
  },
});

const selectTab = defineTool({
  capability: 'core-tabs',

  schema: {
    name: 'browser_tab_select',
    title: 'Select a tab',
    description: 'Select a tab by index',
    inputSchema: z.object({
      index: z.number().describe('The index of the tab to select'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    await context.selectTab(params.index);
    response.setIncludeSnapshot();
  },
});

const newTab = defineTool({
  capability: 'core-tabs',

  schema: {
    name: 'browser_tab_new',
    title: 'Open a new tab',
    description: 'Open a new tab',
    inputSchema: createSchemaWithProjectIsolation({
      url: z.string().optional().describe('The URL to navigate to in the new tab. If not provided, the new tab will be blank.'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    // 验证项目隔离参数
    const hasProjectInfo = !!context.getProjectInfo() || validateProjectIsolationParams(params);
    if (!hasProjectInfo)
      throw new Error(getProjectIsolationErrorMessage(!!context.config.projectIsolation));


    // 处理项目信息（仅在首次调用时）
    if (params.projectDrive && params.projectPath) {
      context.setProjectInfo({
        projectDrive: params.projectDrive,
        projectPath: params.projectPath,
      });
    }

    const tab = await context.newTab();
    if (params.url)
      await tab.navigate(params.url);
    response.setIncludeSnapshot();
  },
});

const closeTab = defineTool({
  capability: 'core-tabs',

  schema: {
    name: 'browser_tab_close',
    title: 'Close a tab',
    description: 'Close a tab',
    inputSchema: z.object({
      index: z.number().optional().describe('The index of the tab to close. Closes current tab if not provided.'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    await context.closeTab(params.index);
    response.setIncludeSnapshot();
  },
});

export default [
  listTabs,
  newTab,
  selectTab,
  closeTab,
];
