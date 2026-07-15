import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  PanelLeft,
  Package,
  Upload,
  CalendarDays,
  TrendingUp,
  Settings,
  Rocket,
  PackageCheck,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { InstallAppButton } from "./InstallAppButton";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Package, label: "Production Items", path: "/skus" },
  { icon: Upload, label: "Upload Data", path: "/upload" },
  { icon: TrendingUp, label: "Velocity & Par", path: "/velocity" },
  { icon: Rocket, label: "Product Launch", path: "/product-launch-roadmap" },
  { icon: CalendarDays, label: "Production Calendar", path: "/calendar" },
  { icon: PackageCheck, label: "Projected Units", path: "/projected-units" },
  { icon: Settings, label: "Categories", path: "/categories" },
];

const externalNavigation = {
  IL: [
    {
      label: "Production Tracker",
      href: "https://manufacturing-tracker.onrender.com",
    },
    {
      label: "Velocity Tracker",
      href: "https://velocity-tracker-zc5x.onrender.com",
    },
    {
      label: "Recipe Tracker",
      href: "https://recipe-workbook.onrender.com",
    },
    {
      label: "Ingredient Tracker",
      href: "https://ingredient-projection-workbook.onrender.com",
    },
  ],
  NY: [
    {
      label: "Production Tracker",
      href: "https://manufacturing-tracker-ny.onrender.com",
    },
    {
      label: "Ingredient Tracker",
      href: "https://ingredient-projection-workbook-ny.onrender.com",
    },
    {
      label: "Velocity Tracker",
      href: "https://velocity-tracker-ny.onrender.com",
    },
    {
      label: "Recipe Tracker",
      href: "https://recipe-workbook-ny.onrender.com",
    },
  ],
} as const;

type NavigationGroup = keyof typeof externalNavigation;

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find((item) => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-foreground">
                    Elevated Ops
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <InstallAppButton className="mb-2 w-full group-data-[collapsible=icon]:hidden" />
            <InstallAppButton compact className="mb-2 hidden group-data-[collapsible=icon]:inline-flex" />
            <div className="flex items-center gap-3 rounded-lg px-1 py-1 w-full group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-9 w-9 border shrink-0">
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                  {user?.name?.charAt(0).toUpperCase() ?? "W"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium truncate leading-none text-foreground">
                  {user?.name || "Workspace"}
                </p>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="sticky top-0 z-40 flex min-h-14 flex-col gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          {isMobile ? (
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="truncate tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">Manufacturing Tracker</span>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <ExternalNavigation />
            {isMobile ? (
              <InstallAppButton compact className="h-9 w-9 shrink-0" />
            ) : null}
          </div>
        </div>
        <main className="flex-1 overflow-x-hidden p-3 sm:p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}

function ExternalNavigation() {
  const [selectedGroup, setSelectedGroup] = useState<NavigationGroup>(() => {
    const currentHost =
      typeof window === "undefined" ? "" : window.location.hostname;
    return externalNavigation.NY.some(
      ({ href }) => new URL(href).hostname === currentHost,
    )
      ? "NY"
      : "IL";
  });

  return (
    <nav
      aria-label="External tools"
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <div
        aria-label="Location group"
        className="grid h-9 shrink-0 grid-cols-2 rounded-md border bg-muted p-0.5"
        role="group"
      >
        {(Object.keys(externalNavigation) as NavigationGroup[]).map((group) => {
          const isSelected = group === selectedGroup;
          return (
            <button
              key={group}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedGroup(group)}
              className={`inline-flex h-8 items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {group}
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
        {externalNavigation[selectedGroup].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:px-3 xl:text-sm"
          >
            <span>{link.label}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        ))}
      </div>
    </nav>
  );
}
