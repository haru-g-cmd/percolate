import { useStore } from '../stores/simulationStore'

export default function ScenarioPanel() {
  const sim = useStore((s) => s.sim)
  const send = useStore((s) => s.send)

  if (!sim) return null

  const scenarios = sim.scenarios
  const activeId = sim.activeScenario?.id ?? null

  if (!scenarios || scenarios.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-gray-600 text-center">
          No scenarios available for this topology.
        </p>
      </div>
    )
  }

  const handleLoadScenario = (scenarioId: number) => {
    send({ type: 'load_scenario', scenarioId })
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto">
      {scenarios.map((scenario) => {
        const isActive = scenario.id === activeId
        return (
          <button
            key={scenario.id}
            onClick={() => handleLoadScenario(scenario.id)}
            className={`w-full text-left bg-gray-800/50 hover:bg-gray-800 border rounded-lg p-3 cursor-pointer transition ${
              isActive
                ? 'border-cyan-500/50 bg-cyan-500/5 border-l-2 border-l-cyan-400'
                : 'border-gray-700/50'
            }`}
          >
            <div className="font-medium text-sm text-gray-200">{scenario.name}</div>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{scenario.description}</p>
          </button>
        )
      })}
    </div>
  )
}
