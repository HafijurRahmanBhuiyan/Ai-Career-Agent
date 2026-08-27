import { JobSource } from "./jobSource.types";

type JobSourceFactory = () => JobSource;

const factories: Record<string, JobSourceFactory> = {};

export function registerJobSource(factory: JobSourceFactory): void {
  const instance = factory();
  factories[instance.id] = factory;
}

export function getJobSource(id: string): JobSource | undefined {
  const factory = factories[id];
  if (!factory) return undefined;
  return factory();
}

export function getEnabledJobSources(): JobSource[] {
  const enabled = Object.keys(factories);
  return enabled.map((id) => getJobSource(id)!).filter(Boolean);
}

export function getSourceIds(): string[] {
  return Object.keys(factories);
}
