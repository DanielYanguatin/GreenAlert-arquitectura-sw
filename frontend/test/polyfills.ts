// jsdom (Jest 29) no expone TextEncoder/TextDecoder, que React Router 7 necesita.
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
