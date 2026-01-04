// SPDX-License-Identifier: MPL-2.0
// User context (container) I/O operations

const { ContextualIdentityService } = ChromeUtils.importESModule(
  "resource://gre/modules/ContextualIdentityService.sys.mjs",
);

type Container = {
  userContextId: number;
  public: boolean;
  icon: string;
  color: number;
  name: string;
};

/**
 * Get the color for a user context (container)
 */
export function getUserContextColor(userContextId: number): number | null {
  const containerList =
    ContextualIdentityService.getPublicIdentities() as Container[];
  return (
    containerList.find((container) => container.userContextId === userContextId)
      ?.color ?? null
  );
}

/**
 * Get all public user contexts
 */
export function getUserContexts(): Container[] {
  return ContextualIdentityService.getPublicIdentities() as Container[];
}
