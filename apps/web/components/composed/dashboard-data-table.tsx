"use client";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DashboardDataTable({
  className,
  testId = "dashboard-data-table",
  ...props
}: React.ComponentProps<typeof Table> & { testId?: string }) {
  return (
    <Table
      data-testid={testId}
      className={cn("w-full border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function DashboardDataTableHeader({
  className,
  ...props
}: React.ComponentProps<typeof TableHeader>) {
  return (
    <TableHeader
      className={cn("sticky top-0 z-10 bg-muted/80 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function DashboardDataTableBody({
  className,
  ...props
}: React.ComponentProps<typeof TableBody>) {
  return <TableBody className={className} {...props} />;
}

export function DashboardDataTableRow({
  className,
  ...props
}: React.ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn("border-b border-border/50 align-middle transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}

export function DashboardDataTableHead({
  className,
  ...props
}: React.ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      className={cn("px-3 py-2 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function DashboardDataTableCell({
  className,
  ...props
}: React.ComponentProps<typeof TableCell>) {
  return (
    <TableCell
      className={cn("px-3 py-2 align-middle text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
