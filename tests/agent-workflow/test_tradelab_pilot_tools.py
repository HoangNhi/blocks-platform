import importlib.util
from pathlib import Path


class FakeContext:
    def __init__(self):
        self.tools = []

    def register_tool(self, **kwargs):
        self.tools.append(kwargs)


def test_plugin_registers_only_two_research_tools() -> None:
    path = Path('agents/integrations/hermes/tradelab_research/__init__.py')
    spec = importlib.util.spec_from_file_location("tradelab_research_plugin", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    ctx = FakeContext()
    module.register(ctx)
    assert [item["name"] for item in ctx.tools] == [
        "tradelab_research_status", "tradelab_submit_experiment"
    ]
    assert {item["toolset"] for item in ctx.tools} == {"tradelab_research"}


def test_submit_schema_accepts_research_assessment_but_no_receipt_fields() -> None:
    path = Path('agents/integrations/hermes/tradelab_research/__init__.py')
    spec = importlib.util.spec_from_file_location("tradelab_research_plugin_schema", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    ctx = FakeContext()
    module.register(ctx)
    submit = [t for t in ctx.tools if t["name"] == "tradelab_submit_experiment"][0]
    properties = submit["schema"]["properties"]
    assert {"runId", "botId", "strategyId", "versionId", "metrics"}.isdisjoint(properties)
    assert submit["schema"]["additionalProperties"] is False


def test_plugin_has_no_file_or_execution_tool() -> None:
    path = Path('agents/integrations/hermes/tradelab_research/__init__.py')
    spec = importlib.util.spec_from_file_location("tradelab_research_plugin_nofie", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    ctx = FakeContext()
    module.register(ctx)
    assert {tool["name"] for tool in ctx.tools}.isdisjoint(
        {"read_file", "search_files", "write_file", "patch", "terminal", "browser"}
    )
