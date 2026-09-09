import pc from "picocolors";

export interface Column<T> {
  header: string;
  value: (row: T) => string;
  align?: "left" | "right";
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

function width(value: string): number {
  return value.replace(ANSI, "").length;
}

function pad(value: string, size: number, align: "left" | "right"): string {
  const gap = Math.max(0, size - width(value));
  return align === "right" ? " ".repeat(gap) + value : value + " ".repeat(gap);
}

export function renderTable<T>(rows: T[], columns: Column<T>[]): string {
  if (!rows.length) return pc.dim("  (nothing to show)");

  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, index) =>
    Math.max(width(column.header), ...cells.map((row) => width(row[index]!))),
  );

  const header = columns
    .map((column, index) =>
      pc.dim(
        pc.bold(pad(column.header, widths[index]!, column.align ?? "left")),
      ),
    )
    .join("  ");

  const body = cells.map((row) =>
    row
      .map((cell, index) =>
        pad(cell, widths[index]!, columns[index]!.align ?? "left"),
      )
      .join("  "),
  );

  return [`  ${header}`, ...body.map((line) => `  ${line}`)].join("\n");
}
