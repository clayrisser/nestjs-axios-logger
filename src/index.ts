/**
 * File: /src/index.ts
 * Project: nestjs-axios-logger
 * File Created: 17-07-2021 22:16:57
 * Author: Risser Labs LLC <info@risserlabs.com>
 * -----
 * Last Modified: 23-10-2022 15:15:40
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

import axios, { AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import httpStatus from 'http-status';
import { DynamicModule, ForwardReference, Global, Inject, Logger, Module, OnModuleInit, Type } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
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
      url: true,
      ...options,
    };
  }

  onModuleInit() {
    if (!registeredAxiosInterceptors) {
      const logger = new Logger(HttpService.name);
      axios.interceptors.request.use(
        (request: AxiosRequestConfig) => requestLogger(request, this.options, logger),
        (error: AxiosError<any>) => errorLogger(error, this.options, logger),
      );
      axios.interceptors.response.use(
        (response: AxiosResponse) => responseLogger(response, this.options, logger),
        (error: AxiosError<any>) => errorLogger(error, this.options, logger),
      );
      registeredAxiosInterceptors = true;
    }
  }
}

function requestLogger(request: AxiosRequestConfig, options: AxiosLoggerOptions, logger: Logger) {
  let message = `[Request]${options.method ? ` ${request.method}` : ''}${options.url ? ` ${request.url}` : ''}`;
  if (typeof options.request === 'function') {
    message = options.request(request, options);
  }
  logger[options.requestLogLevel as 'log'](
    {
      ...(options.data ? { data: request.data } : {}),
      ...(options.headers ? { headers: request.headers } : {}),
      ...(options.method ? { method: request.method } : {}),
      ...(options.url ? { url: request.url } : {}),
    },
    message,
  );
  return request;
}

function responseLogger(response: AxiosResponse, options: AxiosLoggerOptions, logger: Logger) {
  const statusName = httpStatus[`${response.status}_NAME}`];
  let message = `[Response]${options.method ? ` ${response.request.method}` : ''}${
    options.url ? ` ${response.request.url}` : ''
  }${options.status ? ` ${response.status}` : ''}${statusName ? ` ${statusName}` : ''}`;
  if (typeof options.response === 'function') {
    message = options.response(response, options);
  }
  logger[options.responseLogLevel as 'verbose'](
    {
      ...(options.data ? { data: response.data } : {}),
      ...(options.headers ? { headers: response.headers } : {}),
      ...(options.method ? { method: response.request.method } : {}),
      ...(options.status ? { status: response.status } : {}),
      ...(options.url ? { url: response.request.url } : {}),
    },
    message,
  );
  return response;
}

function errorLogger(err: AxiosError | string, options: AxiosLoggerOptions, logger: Logger) {
  let errOrStr = err;
  if (options.error) {
    errOrStr = options.error(errOrStr, options);
  }
  const error = typeof errOrStr === 'object' ? errOrStr : new AxiosError(errOrStr);
  logger[options.errorLogLevel as 'error'](
    {
      ...(options.data ? { data: error?.response?.data } : {}),
      ...(options.headers ? { headers: error?.response?.headers } : {}),
      ...(options.method ? { method: error?.request?.method } : {}),
      ...(options.status ? { status: error?.response?.status } : {}),
    },
    error,
  );
  return err;
}
