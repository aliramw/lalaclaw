import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

describe("surface primitives", () => {
  it("renders the refreshed surface roles and focus affordances in dark mode", () => {
    render(
      <div>
        <div data-testid="light-root">
          <Button>Send</Button>
          <Button variant="outline">Inspect</Button>
          <Card data-testid="card-light">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
            </CardHeader>
            <CardContent>Ready</CardContent>
          </Card>
          <Tabs defaultValue="one">
            <TabsList data-testid="tabs-list-light">
              <TabsTrigger data-testid="tabs-trigger-light" value="one">
                One
              </TabsTrigger>
            </TabsList>
            <TabsContent value="one">Panel</TabsContent>
          </Tabs>
          <Textarea aria-label="Composer light" />
          <Badge variant="active">Live light</Badge>
        </div>
        <div className="dark" data-testid="dark-root">
          <Button>Send</Button>
          <Button variant="outline">Inspect</Button>
          <Card data-testid="card-dark">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
            </CardHeader>
            <CardContent>Ready</CardContent>
          </Card>
          <Tabs defaultValue="one">
            <TabsList data-testid="tabs-list-dark">
              <TabsTrigger data-testid="tabs-trigger-dark" value="one">
                One
              </TabsTrigger>
            </TabsList>
            <TabsContent value="one">Panel</TabsContent>
          </Tabs>
          <Textarea aria-label="Composer dark" />
          <Badge variant="active">Live dark</Badge>
        </div>
      </div>,
    );

    const lightRoot = screen.getByTestId("light-root");
    const darkRoot = screen.getByTestId("dark-root");
    const light = within(lightRoot);
    const dark = within(darkRoot);
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const readRuleBlock = (selector) => {
      const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
      const match = css.match(pattern);
      return match ? match[1] : "";
    };
    const rootBlock = readRuleBlock(":root");
    const darkBlock = readRuleBlock(".dark");

    const lightButton = light.getByRole("button", { name: "Send" });
    const darkButton = dark.getByRole("button", { name: "Send" });
    const lightOutlineButton = light.getByRole("button", { name: "Inspect" });
    const darkOutlineButton = dark.getByRole("button", { name: "Inspect" });
    const lightCard = light.getByTestId("card-light");
    const darkCard = dark.getByTestId("card-dark");
    const lightTabsList = light.getByTestId("tabs-list-light");
    const darkTabsList = dark.getByTestId("tabs-list-dark");
    const lightTabsTrigger = light.getByTestId("tabs-trigger-light");
    const darkTabsTrigger = dark.getByTestId("tabs-trigger-dark");
    const lightTextarea = light.getByLabelText("Composer light");
    const darkTextarea = dark.getByLabelText("Composer dark");
    const lightBadge = light.getByText("Live light");
    const darkBadge = dark.getByText("Live dark");

    expect(darkRoot).toHaveClass("dark");
    expect(rootBlock).toMatch(/--surface:\s*#fffaf1;/);
    expect(rootBlock).toMatch(/--surface-elevated:\s*#fffdf8;/);
    expect(rootBlock).toMatch(/--panel-muted:\s*#f1e7d7;/);
    expect(rootBlock).toMatch(/--card:\s*var\(--surface\);/);
    expect(rootBlock).toMatch(/--popover:\s*var\(--surface-elevated\);/);
    expect(rootBlock).toMatch(/--secondary:\s*var\(--panel\);/);
    expect(rootBlock).toMatch(/--muted:\s*var\(--background-muted\);/);
    expect(rootBlock).toMatch(/--focus-ring:\s*#d06a00;/);
    expect(rootBlock).toMatch(/--ring:\s*var\(--focus-ring\);/);
    expect(darkBlock).toMatch(/--surface:\s*#10202f;/);
    expect(darkBlock).toMatch(/--surface-elevated:\s*#13283b;/);
    expect(darkBlock).toMatch(/--panel-muted:\s*#0f2739;/);
    expect(darkBlock).toMatch(/--focus-ring:\s*#0ea5e9;/);

    expect(lightButton).toHaveClass("rounded-lg", "bg-primary", "text-primary-foreground", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(darkButton).toHaveClass("rounded-lg", "bg-primary", "text-primary-foreground", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(lightOutlineButton).toHaveClass("border-border/80", "bg-[var(--surface-elevated)]", "text-foreground");
    expect(darkOutlineButton).toHaveClass("border-border/80", "bg-[var(--surface-elevated)]", "text-foreground");
    expect(lightCard).toHaveClass("rounded-xl", "bg-[var(--surface)]", "text-card-foreground");
    expect(darkCard).toHaveClass("rounded-xl", "bg-[var(--surface)]", "text-card-foreground");
    expect(lightTabsList).toHaveClass("rounded-xl", "bg-[var(--panel-muted)]", "text-muted-foreground");
    expect(darkTabsList).toHaveClass("rounded-xl", "bg-[var(--panel-muted)]", "text-muted-foreground");
    expect(lightTabsTrigger).toHaveClass("rounded-lg", "data-[state=active]:bg-[var(--surface)]", "data-[state=active]:text-foreground", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background");
    expect(darkTabsTrigger).toHaveClass("rounded-lg", "data-[state=active]:bg-[var(--surface)]", "data-[state=active]:text-foreground", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background");
    expect(lightTextarea).toHaveClass("rounded-xl", "bg-[var(--surface-elevated)]", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(darkTextarea).toHaveClass("rounded-xl", "bg-[var(--surface-elevated)]", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(lightBadge).toHaveClass("rounded-full", "bg-primary", "text-primary-foreground");
    expect(darkBadge).toHaveClass("rounded-full", "bg-primary", "text-primary-foreground");
  });
});
