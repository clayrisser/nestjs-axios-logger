/**
 * File: /src/index.ts
 * Project: nestjs-axios-logger
 * File Created: 17-07-2021 22:16:57
 * Author: Silicon Hills LLC <info@siliconhills.dev>
 * -----
 * Last Modified: 18-07-2021 00:10:52
 * Modified By: Silicon Hills LLC <info@siliconhills.dev>
 * -----
 * Silicon Hills LLC (c) Copyright 2021
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

import axios, { AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import { GlobalLogConfig } from 'axios-logger/lib/common/types';
import { HttpService } from '@nestjs/axios';
import {
  DynamicModule,
  Inject,
  Logger,
  Module,
  OnModuleInit
} from '@nestjs/common';
import { errorLogger, requestLogger, responseLogger } from 'axios-logger';
import {
  AXIOS_LOGGER_OPTIONS,
  AxiosLoggerAsyncOptions,
  AxiosLoggerOptions
} from './types';

// force idempotence (like c/c++ `#pragma once`) if module loaded more than once
let registeredAxiosInterceptors = false;

@Module({})
export class AxiosLoggerModule implements OnModuleInit {
  private static readonly imports = [];

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
      ...options
    };
  }

  public static register(options: AxiosLoggerOptions): DynamicModule {
    return {
      module: AxiosLoggerModule,
      global: true,
      imports: AxiosLoggerModule.imports,
      providers: [
        {
          provide: AXIOS_LOGGER_OPTIONS,
          useValue: options
        }
      ],
      exports: [AXIOS_LOGGER_OPTIONS]
    };
  }

  public static registerAsync(
    asyncOptions: AxiosLoggerAsyncOptions
  ): DynamicModule {
    return {
      module: AxiosLoggerModule,
      global: true,
      imports: [...AxiosLoggerModule.imports, ...(asyncOptions.imports || [])],
      providers: [AxiosLoggerModule.createOptionsProvider(asyncOptions)],
      exports: [AXIOS_LOGGER_OPTIONS]
    };
  }

  private static createOptionsProvider(asyncOptions: AxiosLoggerAsyncOptions) {
    if (!asyncOptions.useFactory) {
      throw new Error("registerAsync must have 'useFactory'");
    }
    return {
      inject: asyncOptions.inject || [],
      provide: AXIOS_LOGGER_OPTIONS,
      useFactory: asyncOptions.useFactory
    };
  }

  onModuleInit() {
    if (!registeredAxiosInterceptors) {
      const logger = new Logger(HttpService.name);
      const config: GlobalLogConfig = {
        data: this.options.data,
        dateFormat: false,
        headers: this.options.headers,
        method: this.options.method,
        prefixText: false,
        status: this.options.status,
        statusText: this.options.statusText,
        url: this.options.url
      };
      const requestConfig: GlobalLogConfig = {
        ...config,
        logger: (message: string) => {
          if (typeof this.options.request === 'function') {
            const newMessage = this.options.request(message);
            if (newMessage) message = newMessage;
          }
          logger[this.options.requestLogLevel || 'verbose'](message);
        }
      };
      const responseConfig: GlobalLogConfig = {
        ...config,
        logger: (message: string) => {
          if (typeof this.options.response === 'function') {
            const newMessage = this.options.response(message);
            if (newMessage) message = newMessage;
          }
          logger[this.options.responseLogLevel || 'verbose'](message);
        }
      };
      const errorConfig: GlobalLogConfig = {
        ...config,
        logger: (message: AxiosError<any> | string) => {
          if (typeof this.options.error === 'function') {
            const newMessage = this.options.error(message);
            if (newMessage) message = newMessage;
          }
          logger[this.options.errorLogLevel || 'error'](message);
        }
      };
      axios.interceptors.request.use(
        (request: AxiosRequestConfig) => requestLogger(request, requestConfig),
        (error: AxiosError<any>) => errorLogger(error, errorConfig)
      );
      axios.interceptors.response.use(
        (response: AxiosResponse) => responseLogger(response, responseConfig),
        (error: AxiosError<any>) => errorLogger(error, errorConfig)
      );
      registeredAxiosInterceptors = true;
    }
  }
}
