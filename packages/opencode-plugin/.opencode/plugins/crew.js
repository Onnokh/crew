export const CrewPlugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "crew-plugin",
      level: "info",
      message: "Crew OpenCode plugin loaded",
    },
  });

  return {};
};
