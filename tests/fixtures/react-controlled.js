import * as React from "react";
import { createRoot } from "react-dom/client";

function ControlledForm() {
  const [fullName, setFullName] = React.useState("");
  const [renderCount, setRenderCount] = React.useState(0);

  return React.createElement(
    "form",
    {
      id: "application-form",
      onSubmit: (event) => event.preventDefault(),
    },
    React.createElement("label", { htmlFor: "full-name" }, "Nome completo"),
    React.createElement("input", {
      id: "full-name",
      name: "fullName",
      type: "text",
      value: fullName,
      onChange: (event) => setFullName(event.currentTarget.value),
    }),
    React.createElement(
      "button",
      { type: "button", onClick: () => setRenderCount((count) => count + 1) },
      "Forçar re-render",
    ),
    React.createElement("output", { "data-testid": "render-count" }, String(renderCount)),
    React.createElement("output", { "data-testid": "controlled-state" }, fullName),
  );
}

createRoot(document.getElementById("root")).render(React.createElement(ControlledForm));
