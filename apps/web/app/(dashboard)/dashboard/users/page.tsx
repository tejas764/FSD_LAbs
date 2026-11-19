"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Loader2, UserCheck, UserPlus, UserX } from "lucide-react";

import { authClient, useSession } from "@/lib/auth-client";
import { runOptimisticToastMutation, runToastMutation } from "@/lib/optimistic-toast";
import { formatDateForDisplay } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TablePaginationControls } from "@/components/composed/table-pagination-controls";
import {
  DashboardDataTable,
  DashboardDataTableBody,
  DashboardDataTableCell,
  DashboardDataTableHead,
  DashboardDataTableHeader,
  DashboardDataTableRow,
} from "@/components/composed/dashboard-data-table";

type DashboardRole = "viewer" | "analyst" | "admin";

interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  banned: boolean;
  createdAt?: string;
  lastActiveAt?: string;
}

interface PendingAdminRoleChange {
  userId: string;
}

interface InviteForm {
  email: string;
  name: string;
  password: string;
  role: DashboardRole;
}

type SortKey = "name" | "email" | "createdAt";
type SortDir = "asc" | "desc";

const EMPTY_INVITE: InviteForm = {
  email: "",
  name: "",
  password: "",
  role: "viewer",
};

function normalizeCreatedAt(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  return undefined;
}

function asUsers(payload: unknown): ManagedUser[] {
  const source = payload as { data?: unknown; users?: unknown };
  const usersRaw = Array.isArray(source?.users)
    ? source.users
    : (source?.data as { users?: unknown })?.users;

  if (!Array.isArray(usersRaw)) return [];

  return usersRaw.flatMap((row) => {
    const user = row as Record<string, unknown>;
    const email = String(user.email ?? "");
    
    // Skip anonymous users created by the better-auth anonymous plugin
    if (email.endsWith("@reporter.crisismap.local")) {
      return [];
    }
    
    return [{
      id: String(user.id ?? ""),
      email,
      name: user.name ? String(user.name) : null,
      role: String(user.role ?? "viewer"),
      banned: Boolean(user.banned ?? false),
      createdAt: normalizeCreatedAt(user.createdAt),
      lastActiveAt: normalizeCreatedAt(user.lastActiveAt ?? user.lastActive ?? user.lastSeenAt ?? user.updatedAt),
    }];
  });
}

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const role = session?.user?.role?.trim().toLowerCase();
  const canManageUsers = role === "admin" || role == null;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE);
  const [savingInvite, setSavingInvite] = useState(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [pendingAdminRoleChange, setPendingAdminRoleChange] = useState<PendingAdminRoleChange | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageIdx, setPageIdx] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const adminApi = useMemo(() => {
    return (authClient as unknown as {
      admin?: {
        listUsers?: (input?: unknown) => Promise<unknown>;
        createUser?: (input: unknown) => Promise<unknown>;
        setRole?: (input: unknown) => Promise<unknown>;
        banUser?: (input: unknown) => Promise<unknown>;
        unbanUser?: (input: unknown) => Promise<unknown>;
      };
    }).admin;
  }, []);

  const loadUsers = useCallback(async () => {
    if (!adminApi?.listUsers) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await adminApi.listUsers({
        query: {
          limit: 100,
          offset: 0,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      });
      setUsers(asUsers(result));
    } finally {
      setLoading(false);
    }
  }, [adminApi]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleInviteSubmit = useCallback(async () => {
    if (!adminApi?.createUser) return;
    setSavingInvite(true);
    try {
      const result = await runToastMutation({
        commit: () => adminApi.createUser!({
          email: inviteForm.email,
          name: inviteForm.name || undefined,
          password: inviteForm.password,
          role: inviteForm.role,
        }),
        successMessage: t("dashboard.users.toast_invite_success"),
        errorMessage: t("dashboard.users.toast_invite_error"),
      });

      if (result) {
        setInviteOpen(false);
        setInviteForm(EMPTY_INVITE);
        await loadUsers();
      }
    } finally {
      setSavingInvite(false);
    }
  }, [adminApi, inviteForm, loadUsers, t]);

  const handleRoleChange = useCallback(async (userId: string, role: DashboardRole) => {
    if (!adminApi?.setRole) return;
    const previousUsers = users;

    setMutatingUserId(userId);
    try {
      await runOptimisticToastMutation({
        getSnapshot: () => previousUsers,
        applyOptimistic: () => {
          setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role } : user)));
        },
        commit: () => adminApi.setRole!({ userId, role }).then(() => undefined),
        rollback: (snapshot) => setUsers(snapshot),
        successMessage: t("dashboard.users.toast_role_success"),
        errorMessage: t("dashboard.users.toast_role_error"),
      });
    } finally {
      setMutatingUserId(null);
    }
  }, [adminApi, t, users]);

  const handleToggleActive = useCallback(async (userId: string, banned: boolean) => {
    const admin = adminApi;
    if (!admin) return;
    if (banned && !admin.unbanUser) return;
    if (!banned && !admin.banUser) return;
    const previousUsers = users;

    setMutatingUserId(userId);
    try {
      await runOptimisticToastMutation({
        getSnapshot: () => previousUsers,
        applyOptimistic: () => {
          setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, banned: !banned } : user)));
        },
        commit: () => banned
          ? admin.unbanUser!({ userId }).then(() => undefined)
          : admin.banUser!({ userId, banReason: "dashboard_deactivated" }).then(() => undefined),
        rollback: (snapshot) => setUsers(snapshot),
        successMessage: banned
          ? t("dashboard.users.toast_activate_success")
          : t("dashboard.users.toast_deactivate_success"),
        errorMessage: t("dashboard.users.toast_status_error"),
      });
    } finally {
      setMutatingUserId(null);
    }
  }, [adminApi, t, users]);

  const handleSort = useCallback((key: SortKey) => {
    setSortDir((prev) => {
      if (sortKey === key) {
        return prev === "asc" ? "desc" : "asc";
      }
      return "desc";
    });
    setSortKey(key);
    setPageIdx(0);
  }, [sortKey]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const left = keyValue(a, sortKey);
      const right = keyValue(b, sortKey);
      const cmp = left < right ? -1 : left > right ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const pagedUsers = sortedUsers.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);

  useEffect(() => {
    setPageIdx((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-6" data-density="operations">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("dashboard.users.title")}</h2>
        <Button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={!canManageUsers}
          aria-label={t("dashboard.users.invite")}
        >
          <UserPlus aria-hidden="true" className="me-1.5 size-4" />
          {t("dashboard.users.invite")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <DashboardDataTable>
          <DashboardDataTableHeader>
            <DashboardDataTableRow>
              <DashboardDataTableHead>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold"
                  onClick={() => handleSort("name")}
                >
                  {t("dashboard.users.table_name")}
                  <ArrowUpDown aria-hidden="true" className="size-3" />
                </button>
              </DashboardDataTableHead>
              <DashboardDataTableHead>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold"
                  onClick={() => handleSort("email")}
                >
                  {t("dashboard.users.table_email")}
                  <ArrowUpDown aria-hidden="true" className="size-3" />
                </button>
              </DashboardDataTableHead>
              <DashboardDataTableHead>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold"
                  onClick={() => handleSort("createdAt")}
                >
                  {t("dashboard.users.table_created_at")}
                  <ArrowUpDown aria-hidden="true" className="size-3" />
                </button>
              </DashboardDataTableHead>
              <DashboardDataTableHead>{t("dashboard.users.table_last_active")}</DashboardDataTableHead>
              <DashboardDataTableHead>{t("dashboard.users.table_role")}</DashboardDataTableHead>
              <DashboardDataTableHead>{t("dashboard.users.table_status")}</DashboardDataTableHead>
              <DashboardDataTableHead>{t("dashboard.overview.table_col_actions")}</DashboardDataTableHead>
            </DashboardDataTableRow>
          </DashboardDataTableHeader>
          <DashboardDataTableBody>
            {loading ? (
              <DashboardDataTableRow>
                <DashboardDataTableCell colSpan={7}>
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" role="status" aria-label={t("dashboard.users.loading")}>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    {t("dashboard.users.loading")}
                  </div>
                </DashboardDataTableCell>
              </DashboardDataTableRow>
            ) : sortedUsers.length === 0 ? (
              <DashboardDataTableRow>
                <DashboardDataTableCell colSpan={7} className="py-8 text-center">
                  {t("dashboard.users.empty")}
                </DashboardDataTableCell>
              </DashboardDataTableRow>
            ) : (
              pagedUsers.map((user) => {
                const isMutating = mutatingUserId === user.id;
                const actionLabel = user.banned ? t("dashboard.users.activate") : t("dashboard.users.deactivate");

                return (
                  <DashboardDataTableRow key={user.id}>
                    <DashboardDataTableCell>{user.name ?? "-"}</DashboardDataTableCell>
                    <DashboardDataTableCell>{user.email}</DashboardDataTableCell>
                    <DashboardDataTableCell>
                      {user.createdAt ? formatDateForDisplay(user.createdAt, i18n?.language) : "-"}
                    </DashboardDataTableCell>
                    <DashboardDataTableCell>
                      {user.lastActiveAt ? formatDateForDisplay(user.lastActiveAt, i18n?.language) : "-"}
                    </DashboardDataTableCell>
                    <DashboardDataTableCell>
                      <Select
                        value={(user.role?.toLowerCase() as DashboardRole) ?? "viewer"}
                        onValueChange={(value) => {
                          const nextRole = value as DashboardRole;
                          const currentRole = (user.role?.toLowerCase() as DashboardRole) ?? "viewer";

                          if (nextRole === "admin" && currentRole !== "admin") {
                            setPendingAdminRoleChange({ userId: user.id });
                            return;
                          }

                          void handleRoleChange(user.id, nextRole);
                        }}
                        disabled={!canManageUsers}
                      >
                        <SelectTrigger aria-label={`${t("dashboard.users.role")} ${user.email}`} className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">{t("dashboard.users.role_viewer")}</SelectItem>
                          <SelectItem value="analyst">{t("dashboard.users.role_analyst")}</SelectItem>
                          <SelectItem value="admin">{t("dashboard.users.role_admin")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </DashboardDataTableCell>
                    <DashboardDataTableCell>
                      {user.banned ? t("dashboard.users.status_deactivated") : t("dashboard.users.status_active")}
                    </DashboardDataTableCell>
                    <DashboardDataTableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-xs"
                              disabled={isMutating || !canManageUsers}
                              aria-label={`${actionLabel} ${user.email}`}
                              onClick={() => {
                                void handleToggleActive(user.id, user.banned);
                              }}
                            >
                              {isMutating ? (
                                <Loader2 aria-hidden="true" className="animate-spin" />
                              ) : user.banned ? (
                                <UserCheck aria-hidden="true" />
                              ) : (
                                <UserX aria-hidden="true" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{actionLabel}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </DashboardDataTableCell>
                  </DashboardDataTableRow>
                );
              })
            )}
          </DashboardDataTableBody>
        </DashboardDataTable>

        <TablePaginationControls
          page={pageIdx + 1}
          total={totalPages}
          canGoPrev={pageIdx > 0}
          canGoNext={pageIdx < totalPages - 1}
          onPrev={() => setPageIdx((prev) => prev - 1)}
          onNext={() => setPageIdx((prev) => prev + 1)}
          pageSize={pageSize}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPageIdx(0);
          }}
          className="px-3"
        />
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.users.invite")}</DialogTitle>
            <DialogDescription>{t("dashboard.users.invite_description")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">{t("dashboard.users.name")}</Label>
              <Input
                id="invite-name"
                aria-label={t("dashboard.users.name")}
                value={inviteForm.name}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">{t("dashboard.users.email")}</Label>
              <Input
                id="invite-email"
                type="email"
                aria-label={t("dashboard.users.email")}
                value={inviteForm.email}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-password">{t("dashboard.users.temp_password")}</Label>
              <PasswordInput
                id="invite-password"
                aria-label={t("dashboard.users.temp_password")}
                value={inviteForm.password}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">{t("dashboard.users.role")}</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(value) => setInviteForm((prev) => ({ ...prev, role: value as DashboardRole }))}
              >
                <SelectTrigger id="invite-role" aria-label={t("dashboard.users.role")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{t("dashboard.users.role_viewer")}</SelectItem>
                  <SelectItem value="analyst">{t("dashboard.users.role_analyst")}</SelectItem>
                  <SelectItem value="admin">{t("dashboard.users.role_admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              {t("dashboard.reports.cancel_action")}
            </Button>
            <Button
              type="button"
              disabled={savingInvite || !inviteForm.email || !inviteForm.password}
              onClick={() => {
                void handleInviteSubmit();
              }}
            >
              {savingInvite ? <Loader2 aria-hidden="true" className="me-1.5 size-4 animate-spin" /> : null}
              {t("dashboard.users.send_invite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingAdminRoleChange != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAdminRoleChange(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.users.confirm_admin_title")}</DialogTitle>
            <DialogDescription>{t("dashboard.users.confirm_admin_description")}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAdminRoleChange(null)}>
              {t("dashboard.reports.cancel_action")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingAdminRoleChange) {
                  void handleRoleChange(pendingAdminRoleChange.userId, "admin");
                }
                setPendingAdminRoleChange(null);
              }}
            >
              {t("dashboard.users.confirm_admin_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function keyValue(user: ManagedUser, key: SortKey): string {
  if (key === "createdAt") {
    return user.createdAt ?? "";
  }

  if (key === "email") {
    return user.email.toLowerCase();
  }

  return (user.name ?? "").toLowerCase();
}
