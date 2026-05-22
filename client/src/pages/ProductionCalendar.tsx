import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  FlaskConical,
  Loader2,
  MapPin,
  PackageCheck,
} from "lucide-react";
import { useMemo } from "react";
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
  return item.startDate <= key && item.endDate >= key;
}

function formatDate(value: string) {
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}

function compareItemsByType(a: CalendarItem, b: CalendarItem) {
  return typeOrder[a.type] - typeOrder[b.type] || a.title.localeCompare(b.title);
}

export default function ProductionCalendar() {
  const calendarDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 });
    const end = addDays(start, 41);
    return eachDayOfInterval({ start, end });
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Production Calendar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only schedule for the current week and next 6 weeks.
        </p>
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
            <CardTitle className="text-base sm:text-lg">
              {format(calendarDays[0], "MMM d")} - {format(calendarDays[calendarDays.length - 1], "MMM d, yyyy")}
            </CardTitle>
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
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
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
                      weekend ? "bg-muted/60" : "bg-card"
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
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border ${typeStyles[item.type]}`}
                          title={[item.label, item.title, ...item.details].filter(Boolean).join(" - ")}
                        >
                          <span className="font-medium">{item.label}</span>
                          <span>: {item.title}</span>
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
          {!sortedItems.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No schedule items found for this calendar range.
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
                      <th className="pb-3 font-medium text-muted-foreground">Details</th>
                      <th className="pb-3 font-medium text-muted-foreground">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((item) => {
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
                {sortedItems.map((item) => {
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
