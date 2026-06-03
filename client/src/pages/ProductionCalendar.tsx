import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FlaskConical,
  Loader2,
  MapPin,
  PackageCheck,
  Printer,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isWeekend,
  startOfWeek,
} from "date-fns";

type CalendarItem = {
  id: string;
  date: string;
  startDate: string;
  endDate: string;
  type: "batch_hijnx" | "batch_sb" | "event" | "task" | "test_pickup";
  label: string;
  title: string;
  quantity: number | null;
  details: string[];
  completion?: {
    completed: number;
    total: number;
    percent: number;
  } | null;
  activeDates?: string[];
  updatedAt: string | null;
};

const typeStyles: Record<CalendarItem["type"], string> = {
  batch_hijnx: "bg-emerald-50 text-emerald-800 border-emerald-200",
  batch_sb: "bg-sky-50 text-sky-800 border-sky-200",
  event: "bg-violet-50 text-violet-800 border-violet-200",
  task: "bg-amber-50 text-amber-800 border-amber-200",
  test_pickup: "bg-rose-50 text-rose-800 border-rose-200",
};

const typeIcons: Record<CalendarItem["type"], typeof PackageCheck> = {
  batch_hijnx: PackageCheck,
  batch_sb: PackageCheck,
  event: CalendarDays,
  task: ClipboardList,
  test_pickup: FlaskConical,
};

const typeOrder: Record<CalendarItem["type"], number> = {
  batch_hijnx: 0,
  batch_sb: 1,
  test_pickup: 2,
  event: 3,
  task: 4,
};

const orderedTypes: Array<[string, CalendarItem["type"]]> = [
  ["Hijnx", "batch_hijnx"],
  ["SB", "batch_sb"],
  ["Pickup", "test_pickup"],
  ["Event", "event"],
  ["Task", "task"],
];

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function itemTouchesDay(item: CalendarItem, day: Date) {
  const key = dateKey(day);
  if (item.activeDates?.length) return item.activeDates.includes(key);
  return item.startDate <= key && item.endDate >= key;
}

function itemIsCurrentOrFuture(item: CalendarItem, todayKey: string) {
  if (item.activeDates?.length) {
    return item.activeDates.some((activeDate) => activeDate >= todayKey);
  }
  return item.endDate >= todayKey;
}

function formatDate(value: string) {
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}

function compareItemsByType(a: CalendarItem, b: CalendarItem) {
  return typeOrder[a.type] - typeOrder[b.type] || a.title.localeCompare(b.title);
}

function isProductionBatch(item: CalendarItem) {
  return item.type === "batch_hijnx" || item.type === "batch_sb";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printableTypeClass(type: CalendarItem["type"]) {
  return {
    batch_hijnx: "hijnx",
    batch_sb: "sb",
    test_pickup: "pickup",
    event: "event",
    task: "task",
  }[type];
}

function buildPrintDocument(days: Date[], items: CalendarItem[]) {
  const range = `${format(days[0], "MMM d")} - ${format(days[days.length - 1], "MMM d, yyyy")}`;
  const dayHtml = days
    .map((day) => {
      const dayItems = items.filter((item) => itemTouchesDay(item, day)).sort(compareItemsByType);
      const entries = dayItems.length
        ? dayItems
            .map(
              (item) => `
                <div class="item ${printableTypeClass(item.type)}">
                  <div class="item-head">
                    <span class="label">${escapeHtml(item.label)}</span>
                    ${item.quantity == null ? "" : `<span class="qty">${item.quantity.toLocaleString()} units</span>`}
                  </div>
                  <div class="title">${escapeHtml(item.title)}</div>
                  ${
                    isProductionBatch(item) && item.completion
                      ? `<div class="completion">
                          <div><span>Completion</span><strong>${item.completion.percent}%</strong></div>
                          <div class="completion-track"><span style="width: ${item.completion.percent}%"></span></div>
                          <small>${item.completion.completed} of ${item.completion.total} items checked</small>
                        </div>`
                      : ""
                  }
                  ${
                    item.details.length
                      ? `<div class="details">${item.details.map(escapeHtml).join(" | ")}</div>`
                      : ""
                  }
                </div>
              `
            )
            .join("")
        : `<div class="empty">No scheduled items</div>`;

      return `
        <section class="day">
          <h2>${escapeHtml(format(day, "EEE, MMM d"))}</h2>
          ${entries}
        </section>
      `;
    })
    .join("");

  const detailRows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatDate(item.startDate))}${item.endDate !== item.startDate ? ` - ${escapeHtml(formatDate(item.endDate))}` : ""}</td>
          <td><span class="pill ${printableTypeClass(item.type)}">${escapeHtml(item.label)}</span></td>
          <td>${escapeHtml(item.title)}</td>
          <td class="num">${item.quantity?.toLocaleString() ?? "--"}</td>
          <td>${
            isProductionBatch(item) && item.completion
              ? `${item.completion.percent}% (${item.completion.completed}/${item.completion.total})`
              : "--"
          }</td>
          <td>${item.details.map(escapeHtml).join(" | ") || "--"}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <title>Production Schedule ${escapeHtml(range)}</title>
    <style>
      @page { size: landscape; margin: 0.45in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
      header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 14px; }
      h1 { margin: 0; font-size: 24px; line-height: 1.1; }
      .range { color: #4b5563; font-size: 13px; margin-top: 4px; }
      .printed { color: #6b7280; font-size: 10px; text-align: right; }
      .legend { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .legend span, .pill { border: 1px solid currentColor; border-radius: 4px; padding: 2px 6px; font-weight: 700; white-space: nowrap; }
      .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
      .day { min-height: 148px; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px; break-inside: avoid; }
      .day h2 { margin: 0 0 5px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
      .item { border: 1px solid currentColor; border-radius: 4px; padding: 4px; margin-bottom: 4px; break-inside: avoid; }
      .item-head { display: flex; justify-content: space-between; gap: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
      .title { margin-top: 2px; font-weight: 700; overflow-wrap: anywhere; }
      .details { margin-top: 2px; color: #4b5563; overflow-wrap: anywhere; }
      .completion { margin-top: 4px; }
      .completion div:first-child { display: flex; justify-content: space-between; gap: 6px; font-size: 9px; color: #374151; }
      .completion-track { height: 4px; background: rgba(17, 24, 39, 0.14); border-radius: 999px; overflow: hidden; margin-top: 2px; }
      .completion-track span { display: block; height: 100%; background: currentColor; border-radius: inherit; }
      .completion small { display: block; margin-top: 2px; color: #4b5563; font-size: 8px; }
      .qty { white-space: nowrap; }
      .empty { color: #9ca3af; font-style: italic; padding-top: 4px; }
      .hijnx { color: #065f46; background: #ecfdf5; }
      .sb { color: #075985; background: #f0f9ff; }
      .pickup { color: #9f1239; background: #fff1f2; }
      .event { color: #5b21b6; background: #f5f3ff; }
      .task { color: #92400e; background: #fffbeb; }
      .details-table { width: 100%; border-collapse: collapse; margin-top: 18px; page-break-before: always; }
      .details-table th, .details-table td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; vertical-align: top; }
      .details-table th { color: #4b5563; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
      .num { text-align: right; white-space: nowrap; }
      .screen-actions { position: fixed; right: 16px; top: 16px; display: flex; gap: 8px; }
      .screen-actions button { border: 1px solid #d1d5db; background: white; border-radius: 6px; padding: 8px 10px; cursor: pointer; }
      @media print { .screen-actions { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <div class="screen-actions">
      <button onclick="window.print()">Print</button>
      <button onclick="window.close()">Close</button>
    </div>
    <header>
      <div>
        <h1>Production Schedule</h1>
        <div class="range">${escapeHtml(range)}</div>
      </div>
      <div class="printed">Generated ${escapeHtml(format(new Date(), "MMM d, yyyy h:mm a"))}</div>
    </header>
    <div class="legend">
      ${orderedTypes.map(([label, type]) => `<span class="${printableTypeClass(type)}">${escapeHtml(label)}</span>`).join("")}
    </div>
    <main class="grid">${dayHtml}</main>
    <table class="details-table">
      <thead>
        <tr><th>Date</th><th>Type</th><th>Item</th><th>Units</th><th>Completion</th><th>Details</th></tr>
      </thead>
      <tbody>${detailRows || `<tr><td colspan="6">No schedule items found for this calendar range.</td></tr>`}</tbody>
    </table>
    <script>
      window.addEventListener("load", () => setTimeout(() => window.print(), 300));
    </script>
  </body>
</html>`;
}

export default function ProductionCalendar() {
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 0 }), []);
  const [viewStart, setViewStart] = useState(currentWeekStart);

  const calendarDays = useMemo(() => {
    const end = addDays(viewStart, 41);
    return eachDayOfInterval({ start: viewStart, end });
  }, [viewStart]);

  const queryRange = useMemo(
    () => ({
      startDate: dateKey(calendarDays[0]),
      endDate: dateKey(calendarDays[calendarDays.length - 1]),
    }),
    [calendarDays]
  );

  const { data: calendarItems = [], isLoading } = trpc.production.batches.useQuery(queryRange);

  const sortedItems = useMemo(
    () =>
      [...(calendarItems as CalendarItem[])].sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
        return compareItemsByType(a, b);
      }),
    [calendarItems]
  );

  const getItemsForDay = (day: Date) =>
    sortedItems
      .filter((item) => itemTouchesDay(item, day))
      .sort((a, b) => compareItemsByType(a, b) || a.startDate.localeCompare(b.startDate));

  const scheduleDetailsItems = useMemo(() => {
    const todayKey = dateKey(new Date());
    return sortedItems.filter((item) => itemIsCurrentOrFuture(item, todayKey));
  }, [sortedItems]);

  const counts = useMemo(
    () =>
      sortedItems.reduce(
        (acc, item) => {
          acc[item.type] += 1;
          return acc;
        },
        { batch_hijnx: 0, batch_sb: 0, event: 0, task: 0, test_pickup: 0 } satisfies Record<CalendarItem["type"], number>
      ),
    [sortedItems]
  );

  const openPrintableSchedule = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(buildPrintDocument(calendarDays, sortedItems));
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Production Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only schedule for the current week and next 6 weeks.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={openPrintableSchedule}
          disabled={isLoading}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Schedule
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {orderedTypes.map(([label, type]) => (
          <div key={type} className={`rounded-md border px-3 py-2 ${typeStyles[type]}`}>
            <div className="text-xs font-medium">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{counts[type]}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewStart((date) => addDays(date, -42))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-base sm:text-lg min-w-[210px] text-center">
                  {format(calendarDays[0], "MMM d")} - {format(calendarDays[calendarDays.length - 1], "MMM d, yyyy")}
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewStart((date) => addDays(date, 42))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setViewStart(currentWeekStart)}>
                Today
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs">
              {orderedTypes.map(([label, type]) => (
                <span key={type} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded border ${typeStyles[type]}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(42px,0.45fr)_repeat(5,minmax(104px,1.35fr))_minmax(42px,0.45fr)] gap-px bg-border rounded-lg overflow-hidden overflow-x-auto">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <div key={index} className="bg-muted px-1 sm:px-2 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">
                  <span className="sm:hidden">{day}</span>
                  <span className="hidden sm:inline">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]}</span>
                </div>
              ))}

              {calendarDays.map((day) => {
                const dayItems = getItemsForDay(day);
                const weekend = isWeekend(day);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={dateKey(day)}
                    className={`min-h-[72px] sm:min-h-[118px] p-1 sm:p-1.5 ${
                      weekend ? "bg-muted/60 text-[9px]" : "bg-card"
                    }`}
                  >
                    <div
                      className={`text-xs font-medium mb-1 ${
                        isToday
                          ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                          : weekend
                            ? "text-muted-foreground/50"
                            : "text-foreground"
                      }`}
                    >
                      {format(day, "MMM d")}
                    </div>
                    <div className="space-y-1">
                      {dayItems.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className={`text-[10px] leading-tight px-1 py-1 rounded border ${typeStyles[item.type]}`}
                          title={[item.label, item.title, ...item.details].filter(Boolean).join(" - ")}
                        >
                          <span className="font-medium">{item.label}</span>
                          <span>: {item.title}</span>
                          <CompletionTracker item={item} compact />
                        </div>
                      ))}
                      {dayItems.length > 4 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{dayItems.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Schedule Details</CardTitle>
        </CardHeader>
        <CardContent>
          {!scheduleDetailsItems.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No current or upcoming schedule items found.
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">Date</th>
                      <th className="pb-3 font-medium text-muted-foreground">Type</th>
                      <th className="pb-3 font-medium text-muted-foreground">Item</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Units</th>
                      <th className="pb-3 font-medium text-muted-foreground">Completion</th>
                      <th className="pb-3 font-medium text-muted-foreground">Details</th>
                      <th className="pb-3 font-medium text-muted-foreground">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleDetailsItems.map((item) => {
                      const Icon = typeIcons[item.type];
                      return (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(item.startDate)}
                            {item.endDate !== item.startDate ? ` - ${formatDate(item.endDate)}` : ""}
                          </td>
                          <td className="py-3">
                            <Badge variant="outline" className={`gap-1 ${typeStyles[item.type]}`}>
                              <Icon className="h-3 w-3" />
                              {item.label}
                            </Badge>
                          </td>
                          <td className="py-3 font-medium text-foreground">{item.title}</td>
                          <td className="py-3 text-right tabular-nums">{item.quantity?.toLocaleString() ?? "--"}</td>
                          <td className="py-3 min-w-[150px]">
                            <CompletionTracker item={item} />
                          </td>
                          <td className="py-3 text-muted-foreground text-xs max-w-[320px]">
                            <DetailList details={item.details} />
                          </td>
                          <td className="py-3 text-muted-foreground text-xs whitespace-nowrap">{item.updatedAt ?? "--"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {scheduleDetailsItems.map((item) => {
                  const Icon = typeIcons[item.type];
                  return (
                    <div key={item.id} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{item.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(item.startDate)}
                            {item.endDate !== item.startDate ? ` - ${formatDate(item.endDate)}` : ""}
                          </div>
                        </div>
                        <Badge variant="outline" className={`shrink-0 gap-1 ${typeStyles[item.type]}`}>
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.quantity != null && (
                          <span className="inline-flex items-center gap-1">
                            <PackageCheck className="h-3 w-3" />
                            {item.quantity.toLocaleString()} units
                          </span>
                        )}
                        <DetailList details={item.details} />
                      </div>
                      <CompletionTracker item={item} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CompletionTracker({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  if (!isProductionBatch(item) || !item.completion) {
    return compact ? null : <span className="text-xs text-muted-foreground">--</span>;
  }

  const { completed, total, percent } = item.completion;

  return (
    <div className={compact ? "mt-1 space-y-0.5" : "space-y-1"}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "text-[9px]" : "text-xs"}`}>
        <span className="font-medium">Completion</span>
        <span className="tabular-nums font-semibold">{percent}%</span>
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-background/70 ${compact ? "h-1" : "h-2 bg-muted"}`}>
        <div className="h-full rounded-full bg-current" style={{ width: `${percent}%` }} />
      </div>
      {!compact && (
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {completed} of {total} items checked
        </div>
      )}
    </div>
  );
}

function DetailList({ details }: { details: string[] }) {
  if (!details.length) return <span>--</span>;

  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {details.map((detail, index) => {
        const Icon = detail.includes(":") || detail.includes("-") ? Clock : detail.length < 24 ? MapPin : ClipboardList;
        return (
          <span key={`${detail}-${index}`} className="inline-flex items-center gap-1">
            <Icon className="h-3 w-3" />
            {detail}
          </span>
        );
      })}
    </span>
  );
}
