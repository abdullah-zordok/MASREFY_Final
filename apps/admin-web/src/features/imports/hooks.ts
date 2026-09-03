"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLockedMutation } from "@/features/foundation/useLockedMutation";
import type {
  ImportsQuery,
  ListQuery,
  Phase4ActionRequest,
  Phase4Resource,
  PlatformScope,
} from "./contracts";
import { importsRepository, phase4Repository } from "./repository";

export const importsQueryKeys = {
  all: ["imports"] as const,
  list: (input: ImportsQuery) => [...importsQueryKeys.all, input] as const,
};

export function useImports(input: ImportsQuery) {
  return useQuery({
    queryKey: importsQueryKeys.list(input),
    queryFn: () => importsRepository.getImports(input),
    placeholderData: (previous) => previous,
  });
}

export function useRetryImport() {
  const client = useQueryClient();
  const mutation = useLockedMutation({
    lockKey: ({ id }: { id: string; expectedRevision: number }) =>
      `retry-import:${id}`,
    mutationFn: ({
      id,
      expectedRevision,
    }: {
      id: string;
      expectedRevision: number;
    }) => importsRepository.retryImport(id, expectedRevision),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: importsQueryKeys.all }),
  });
  return mutation;
}

export const phase4QueryKeys = {
  all: ["phase4-imports-parsers"] as const,
  overview: (platform: PlatformScope) =>
    [...phase4QueryKeys.all, "overview", platform] as const,
  list: (resource: Phase4Resource, input: ListQuery) =>
    [...phase4QueryKeys.all, resource, input] as const,
  detail: (resource: Phase4Resource, id: string) =>
    [...phase4QueryKeys.all, resource, "detail", id] as const,
};

export function useImportOverview(platform: PlatformScope) {
  return useQuery({
    queryKey: phase4QueryKeys.overview(platform),
    queryFn: () => phase4Repository.getOverview(platform),
  });
}

export function usePhase4List(resource: Phase4Resource, input: ListQuery) {
  return useQuery({
    queryKey: phase4QueryKeys.list(resource, input),
    queryFn: () => phase4Repository.list(resource, input),
    placeholderData: (previous) => previous,
  });
}

export function usePhase4Detail(
  resource: Extract<Phase4Resource, "sessions" | "banks" | "parser-rules">,
  id: string,
) {
  return useQuery({
    queryKey: phase4QueryKeys.detail(resource, id),
    queryFn: () => phase4Repository.getDetail(resource, id),
    enabled: id.length > 0,
  });
}

interface Phase4ActionVariables {
  resource: Phase4Resource;
  id: string;
  request: Phase4ActionRequest;
}

export function usePhase4Action() {
  const client = useQueryClient();
  return useLockedMutation({
    lockKey: ({ resource, id, request }: Phase4ActionVariables) =>
      `${resource}:${id}:${request.action}`,
    mutationFn: ({ resource, id, request }: Phase4ActionVariables) =>
      phase4Repository.act(resource, id, request),
    onSuccess: (_response, variables) =>
      client.invalidateQueries({
        queryKey: [...phase4QueryKeys.all, variables.resource],
      }),
  });
}
