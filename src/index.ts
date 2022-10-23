/**
 * File: /src/index.ts
 * Project: nestjs-axios-logger
 * File Created: 17-07-2021 22:16:57
 * Author: Risser Labs LLC <info@risserlabs.com>
 * -----
 * Last Modified: 23-10-2022 06:16:42
 * Modified By: Risser Labs LLC <info@risserlabs.com>
 * -----
 * Risser Labs LLC (c) Copyright 2021
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

import axios, { AxiosRequestConfig, AxiosError, AxiosResponse, AxiosInstance } from 'axios';
import { GlobalLogConfig } from 'axios-logger/lib/common/types';
import { HttpService } from '@nestjs/axios';
import { DynamicModule, ForwardReference, Global, Inject, Logger, Module, OnModuleInit, Type } from '@nestjs/common';
import { errorLogger, requestLogger, responseLogger } from 'axios-logger';
import { AXIOS_LOGGER_OPTIONS, AxiosLoggerAsyncOptions, AxiosLoggerOptions } from './types';

// force idempotence (like c/c++ `#pragma once`) if module loaded more than once
let registeredAxiosInterceptors = false;

const imports: Array<Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference> = [];

@Global()
@Module({
  exports: [AXIOS_LOGGER_OPTIONS],
  imports,
  providers: [
    {
      provide: AXIOS_LOGGER_OPTIONS,
      useValue: {},
    },
  ],
})
export class AxiosLoggerModule implements OnModuleInit {
  public static register(options: AxiosLoggerOptions): DynamicModule {
    return {
      exports: [AXIOS_LOGGER_OPTIONS],
      global: true,
      imports,
      module: AxiosLoggerModule,
      providers: [
        {
          provide: AXIOS_LOGGER_OPTIONS,
          useValue: options,
        },
      ],
    };
  }

  public static registerAsync(asyncOptions: AxiosLoggerAsyncOptions): DynamicModule {
    return {
      exports: [AXIOS_LOGGER_OPTIONS],
      global: true,
      imports: [...imports, ...(asyncOptions.imports || [])],
      module: AxiosLoggerModule,
      providers: [AxiosLoggerModule.createOptionsProvider(asyncOptions)],
    };
  }

  private static createOptionsProvider(asyncOptions: AxiosLoggerAsyncOptions) {
    if (!asyncOptions.useFactory) {
      throw new Error("registerAsync must have 'useFactory'");
    }
    return {
      inject: asyncOptions.inject || [],
      provide: AXIOS_LOGGER_OPTIONS,
      useFactory: asyncOptions.useFactory,
    };
  }

  private options: AxiosLoggerOptions;

  constructor(@Inject(AXIOS_LOGGER_OPTIONS) options: AxiosLoggerOptions) {
    this.options = {
      data: true,
      errorLogLevel: 'error',
      headers: true,
      method: true,
      requestLogLevel: 'verbose',
      responseLogLevel: 'verbose',
      status: true,
      statusText: true,
      url: true,
      ...options,
    };
  }

  onModuleInit() {
    if (!registeredAxiosInterceptors) {
      inheritGlobalInterceptor();
      const logger = new Logger(HttpService.name);
      const config: GlobalLogConfig = {
        data: this.options.data,
        dateFormat: false,
        headers: this.options.headers,
        method: this.options.method,
        prefixText: false,
        status: this.options.status,
        statusText: this.options.statusText,
        url: this.options.url,
      };
      const requestConfig: GlobalLogConfig = {
        ...config,
        logger: (message: string) => {
          let newMessage: string | undefined;
          if (typeof this.options.request === 'function') {
            newMessage = this.options.request(message);
          }
          logger[this.options.requestLogLevel || 'verbose'](newMessage || message);
        },
      };
      const responseConfig: GlobalLogConfig = {
        ...config,
        logger: (message: string) => {
          let newMessage: string | undefined;
          if (typeof this.options.response === 'function') {
            newMessage = this.options.response(message);
          }
          logger[this.options.responseLogLevel || 'verbose'](newMessage || message);
        },
      };
      const errorConfig: GlobalLogConfig = {
        ...config,
        logger: (message: AxiosError<any> | string) => {
          let newMessage: string | Error | undefined;
          if (typeof this.options.error === 'function') {
            newMessage = this.options.error(message);
          }
          logger[this.options.errorLogLevel || 'error'](newMessage || message);
        },
      };
      axios.interceptors.request.use(
        (request: AxiosRequestConfig) => requestLogger(request, requestConfig),
        (error: AxiosError<any>) => errorLogger(error, errorConfig),
      );
      axios.interceptors.response.use(
        (response: AxiosResponse) => responseLogger(response, responseConfig),
        (error: AxiosError<any>) => errorLogger(error, errorConfig),
      );
      registeredAxiosInterceptors = true;
    }
  }
}

function inheritGlobalInterceptor() {
  const instances: AxiosInstance[] = [];
  const create = axios.create;
  axios.create = function (...args: unknown[]) {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    const instance = create.apply(this, args);
    instances.push(instance);
    for (const key in axios.interceptors) {
      if (Object.hasOwn(axios.interceptors, key)) {
        (axios.interceptors as unknown as any)?.[key]?.handlers?.forEach(
          ({ fulfilled, rejected }: { fulfilled?: any; rejected?: any } = {}) => {
            if (fulfilled && rejected) {
              const interceptor = instance.interceptors[key as 'request' | 'response'];
              if (typeof interceptor?.use === 'function') {
                interceptor.use(fulfilled, rejected);
              }
            }
          },
        );
      }
    }
    return instance;
  } as (config?: AxiosRequestConfig) => AxiosInstance;
  for (const key in axios.interceptors) {
    if (Object.hasOwn(axios.interceptors, key)) {
      ['eject', 'use'].forEach((method: string) => {
        const original = (axios.interceptors as unknown as any)?.[key]?.[method];
        if (original) {
          (axios.interceptors as unknown as any)[key][method] = function (...args: unknown[]) {
            const result = original.apply((axios.interceptors as unknown as any)[key], args);
            instances.forEach((instance) => (instance.interceptors as unknown as any)?.[key]?.[method](...args));
            return result;
          };
        }
      });
    }
  }
}
