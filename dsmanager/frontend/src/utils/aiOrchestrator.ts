// Stub: aiOrchestrator singleton for App.tsx
class AiOrchestrator {
  async assemble(_data: string): Promise<void> {
    console.log('[aiOrchestrator] assemble called (stub)');
  }
}

export const aiOrchestrator = new AiOrchestrator();
