import { createFileRoute } from "@tanstack/react-router";
import { TestePage } from "./teste";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GORRÃO // LAB — Performance Sem Limites" },
      { name: "description", content: "Estratégia, criatividade e dados em máquinas de vendas previsíveis." },
    ],
  }),
  component: TestePage,
});
