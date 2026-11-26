/* eslint-disable no-console */

const stamp = () => new Date().toISOString();

const format = (args: unknown[]) =>
  args.map((arg) =>
    arg instanceof Error ? (arg.stack ?? arg.message) : arg,
  );

export const log = {
  info: (...args: unknown[]) => console.log(stamp(), "INFO", ...format(args)),
  warn: (...args: unknown[]) => console.warn(stamp(), "WARN", ...format(args)),
  error: (...args: unknown[]) =>
    console.error(stamp(), "ERROR", ...format(args)),
};
