/**
 * File: /src/axiosInherit.ts
 * Project: nestjs-axios-logger
 * File Created: 23-10-2022 06:54:32
 * Author: Risser Labs LLC <info@risserlabs.com>
 * -----
 * Last Modified: 23-10-2022 06:59:14
 * Modified By: Risser Labs LLC <info@risserlabs.com>
 * -----
 * Risser Labs LLC (c) Copyright 2021 - 2022
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import axios, { AxiosInstance } from 'axios';

const { create } = axios;
const instances: AxiosInstance[] = [];
axios.create = function (...args) {
  const instance = create.apply(this, args);
  instances.push(instance);
  for (const type in axios.interceptors) {
    if (Object.hasOwn(axios.interceptors, type)) {
      (axios.interceptors as any)[type].handlers.forEach(({ fulfilled, rejected }: { fulfilled: any; rejected: any }) =>
        (instance.interceptors as any)[type].use(fulfilled, rejected),
      );
    }
  }
  return instance;
};
for (const type in axios.interceptors) {
  if (Object.hasOwn(axios.interceptors, type)) {
    ['eject', 'use'].forEach((method: string) => {
      const original = (axios.interceptors as any)[type][method];
      (axios.interceptors as any)[type][method] = function (...args: unknown[]) {
        const result = original.apply((axios.interceptors as any)[type], args);
        instances.forEach((instance) => (instance.interceptors as any)[type][method](...args));
        return result;
      };
    });
  }
}
