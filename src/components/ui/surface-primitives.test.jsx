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
    expect(css).toContain("--surface: #fffaf1;");
    expect(css).toContain("--surface: #10202f;");
    expect(css).toContain("--surface-elevated: #fffdf8;");
    expect(css).toContain("--surface-elevated: #13283b;");
    expect(css).toContain("--panel-muted: #f1e7d7;");
    expect(css).toContain("--panel-muted: #0f2739;");
    expect(css).toContain("--card: var(--surface);");
    expect(css).toContain("--popover: var(--surface-elevated);");
    expect(css).toContain("--secondary: var(--panel);");
    expect(css).toContain("--muted: var(--background-muted);");
    expect(css).toContain("--focus-ring: #ea7800;");
    expect(css).toContain("--focus-ring: #0ea5e9;");
    expect(css).toContain("--ring: var(--focus-ring);");

    expect(lightButton).toHaveClass("rounded-lg", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(darkButton).toHaveClass("rounded-lg", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(lightOutlineButton).toHaveClass("border-border/80");
    expect(darkOutlineButton).toHaveClass("border-border/80");
    expect(lightCard).toHaveClass("rounded-xl");
    expect(darkCard).toHaveClass("rounded-xl");
    expect(lightTabsList).toHaveClass("rounded-xl");
    expect(darkTabsList).toHaveClass("rounded-xl");
    expect(lightTabsTrigger).toHaveClass("focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background");
    expect(darkTabsTrigger).toHaveClass("focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background");
    expect(lightTextarea).toHaveClass("rounded-xl", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(darkTextarea).toHaveClass("rounded-xl", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background");
    expect(lightBadge).toHaveClass("rounded-full");
    expect(darkBadge).toHaveClass("rounded-full");
  });
});
