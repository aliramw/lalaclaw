import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

describe("surface primitives", () => {
  it("renders the refreshed button, card, tabs, textarea, and badge hierarchy", () => {
    render(
      <div>
        <Button>Send</Button>
        <Button variant="outline">Inspect</Button>
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent>Ready</CardContent>
        </Card>
        <Tabs defaultValue="one">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Panel</TabsContent>
        </Tabs>
        <Textarea aria-label="Composer" />
        <Badge variant="active">Live</Badge>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("rounded-lg");
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveClass("border-border/80");
    expect(screen.getByTestId("card")).toHaveClass("rounded-xl");
    expect(screen.getByTestId("tabs-list")).toHaveClass("rounded-xl");
    expect(screen.getByLabelText("Composer")).toHaveClass("rounded-xl");
    expect(screen.getByText("Live")).toHaveClass("rounded-full");
  });
});
