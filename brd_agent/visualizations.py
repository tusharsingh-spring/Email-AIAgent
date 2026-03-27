"""
BRD Agent - Visualizations Module (Module 6)
==============================================
Creates stunning visual representations of BRD data.

FEATURES:
  - Stakeholder Relationship Graph (NetworkX)
  - Timeline Gantt Chart (Plotly)
  - Requirements Priority Matrix (Plotly)
  - Conflict Heatmap
  - Extraction Confidence Dashboard

HOW TO USE:
  from brd_agent.visualizations import BRDVisualizer
  viz = BRDVisualizer()
  graph_data = viz.build_stakeholder_graph(brd_data)
  gantt_fig = viz.build_timeline_gantt(brd_data)
"""

import json
from typing import List, Dict, Optional

# ============================================================================
# BRD VISUALIZER
# ============================================================================

class BRDVisualizer:
    """
    Creates visual representations of extracted BRD data.

    All methods return either:
      - Plotly figure objects (for Streamlit rendering)
      - JSON data (for API responses)
    """

    def __init__(self):
        """Initialize the visualizer."""
        pass

    # ────────────────────────────────────────────────────────────────────
    # STAKEHOLDER RELATIONSHIP GRAPH
    # ────────────────────────────────────────────────────────────────────

    def build_stakeholder_graph(self, brd_data: Dict) -> Dict:
        """
        Build a stakeholder relationship graph using NetworkX.

        Creates nodes for each stakeholder and edges for their interactions.
        Returns graph data as JSON for frontend rendering.

        PARAMS:
            brd_data: BRD extraction dict with 'stakeholders' field

        RETURNS:
            Dict with 'nodes' and 'edges' lists for network visualization
        """
        try:
            import networkx as nx
        except ImportError:
            return {"nodes": [], "edges": [], "error": "NetworkX not installed"}

        G = nx.Graph()

        stakeholders = brd_data.get("stakeholders", [])
        action_items = brd_data.get("action_items", [])
        decisions = brd_data.get("decisions", [])

        if not stakeholders:
            return {"nodes": [], "edges": []}

        # Add nodes for each stakeholder
        for s in stakeholders:
            name = s.get("name", str(s)) if isinstance(s, dict) else str(s)
            role = s.get("role", "Team Member") if isinstance(s, dict) else "Team Member"
            G.add_node(name, role=role, type="stakeholder")

        # Add the project topic as a central node
        topic = brd_data.get("project_topic", "Project")
        if topic:
            G.add_node(topic, role="Project", type="project")
            for s in stakeholders:
                name = s.get("name", str(s)) if isinstance(s, dict) else str(s)
                G.add_edge(name, topic, relationship="works_on", weight=2)

        # Connect stakeholders who share action items
        for action in action_items:
            action_lower = action.lower() if isinstance(action, str) else ""
            connected = []
            for s in stakeholders:
                name = s.get("name", str(s)) if isinstance(s, dict) else str(s)
                if name.lower().split()[0] in action_lower:  # First name match
                    connected.append(name)

            for i in range(len(connected)):
                for j in range(i + 1, len(connected)):
                    if G.has_edge(connected[i], connected[j]):
                        G[connected[i]][connected[j]]["weight"] += 1
                    else:
                        G.add_edge(connected[i], connected[j],
                                   relationship="collaborates_on", weight=1)

        # Convert to JSON-serializable format
        nodes = []
        for node, data in G.nodes(data=True):
            degree = G.degree(node)
            nodes.append({
                "id": node,
                "label": node,
                "role": data.get("role", ""),
                "type": data.get("type", "stakeholder"),
                "size": 10 + degree * 5,
                "connections": degree
            })

        edges = []
        for u, v, data in G.edges(data=True):
            edges.append({
                "source": u,
                "target": v,
                "relationship": data.get("relationship", "connected"),
                "weight": data.get("weight", 1)
            })

        return {"nodes": nodes, "edges": edges}

    def build_stakeholder_graph_plotly(self, brd_data: Dict):
        """
        Build a Plotly-based stakeholder graph for Streamlit rendering.

        Returns a Plotly figure object.
        """
        try:
            import networkx as nx
            import plotly.graph_objects as go
        except ImportError:
            return None

        graph_data = self.build_stakeholder_graph(brd_data)
        if not graph_data["nodes"]:
            return None

        # Build NetworkX graph from our data
        G = nx.Graph()
        for node in graph_data["nodes"]:
            G.add_node(node["id"], **node)
        for edge in graph_data["edges"]:
            G.add_edge(edge["source"], edge["target"], **edge)

        # Layout
        pos = nx.spring_layout(G, k=2, iterations=50, seed=42)

        # Edge traces
        edge_x = []
        edge_y = []
        for edge in G.edges():
            x0, y0 = pos[edge[0]]
            x1, y1 = pos[edge[1]]
            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])

        edge_trace = go.Scatter(
            x=edge_x, y=edge_y,
            line=dict(width=2, color='rgba(150,150,150,0.5)'),
            hoverinfo='none',
            mode='lines'
        )

        # Node traces
        node_x = []
        node_y = []
        node_text = []
        node_size = []
        node_color = []

        color_map = {"project": "#FF6B6B", "stakeholder": "#4ECDC4"}

        for node in G.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)
            data = G.nodes[node]
            node_text.append(f"{data.get('label', node)}<br>Role: {data.get('role', 'N/A')}")
            node_size.append(data.get("size", 15))
            node_color.append(color_map.get(data.get("type", "stakeholder"), "#4ECDC4"))

        node_trace = go.Scatter(
            x=node_x, y=node_y,
            mode='markers+text',
            hoverinfo='text',
            text=[G.nodes[n].get("label", n) for n in G.nodes()],
            textposition="top center",
            hovertext=node_text,
            marker=dict(
                size=node_size,
                color=node_color,
                line=dict(width=2, color='white'),
                symbol='circle'
            )
        )

        fig = go.Figure(
            data=[edge_trace, node_trace],
            layout=go.Layout(
                title=dict(text="Stakeholder Relationship Graph", font=dict(size=16)),
                showlegend=False,
                hovermode='closest',
                xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                plot_bgcolor='rgba(0,0,0,0)',
                paper_bgcolor='rgba(0,0,0,0)',
                margin=dict(b=20, l=5, r=5, t=40)
            )
        )

        return fig

    # ────────────────────────────────────────────────────────────────────
    # TIMELINE GANTT CHART
    # ────────────────────────────────────────────────────────────────────

    def build_timeline_gantt(self, brd_data: Dict):
        """
        Build a Gantt-style timeline chart from extracted timelines.

        PARAMS:
            brd_data: BRD dict with 'timelines' field

        RETURNS:
            Plotly figure object
        """
        try:
            import plotly.graph_objects as go
        except ImportError:
            return None

        timelines = brd_data.get("timelines", [])
        if not timelines:
            return None

        milestones = []
        dates = []
        colors = []

        color_palette = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
        ]

        for i, t in enumerate(timelines):
            date_str = t.get("date", "TBD") if isinstance(t, dict) else str(t)
            milestone = t.get("milestone", f"Milestone {i+1}") if isinstance(t, dict) else f"Item {i+1}"
            milestones.append(milestone[:50])
            dates.append(date_str)
            colors.append(color_palette[i % len(color_palette)])

        fig = go.Figure(go.Bar(
            x=list(range(len(milestones))),
            y=milestones,
            orientation='h',
            marker=dict(color=colors, line=dict(color='white', width=1)),
            text=dates,
            textposition='inside',
            hovertext=[f"{m}<br>Date: {d}" for m, d in zip(milestones, dates)]
        ))

        fig.update_layout(
            title=dict(text="Project Timeline", font=dict(size=16)),
            xaxis_title="Sequence",
            yaxis_title="Milestone",
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)',
            height=max(300, len(milestones) * 50),
            margin=dict(l=200)
        )

        return fig

    # ────────────────────────────────────────────────────────────────────
    # REQUIREMENTS OVERVIEW CHART
    # ────────────────────────────────────────────────────────────────────

    def build_requirements_chart(self, brd_data: Dict):
        """
        Build a visual overview of extracted BRD elements.

        Shows counts of each element type as a bar chart.
        """
        try:
            import plotly.graph_objects as go
        except ImportError:
            return None

        categories = ['Requirements', 'Decisions', 'Stakeholders',
                       'Timelines', 'Action Items', 'Conflicts']
        counts = [
            len(brd_data.get("requirements", [])),
            len(brd_data.get("decisions", [])),
            len(brd_data.get("stakeholders", [])),
            len(brd_data.get("timelines", [])),
            len(brd_data.get("action_items", [])),
            len(brd_data.get("conflicts", []))
        ]

        colors = ['#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF6B6B']

        fig = go.Figure(go.Bar(
            x=categories,
            y=counts,
            marker=dict(
                color=colors,
                line=dict(color='white', width=1)
            ),
            text=counts,
            textposition='auto'
        ))

        fig.update_layout(
            title=dict(text="BRD Extraction Summary", font=dict(size=16)),
            yaxis_title="Count",
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)',
            height=400
        )

        return fig

    # ────────────────────────────────────────────────────────────────────
    # CONFIDENCE GAUGE
    # ────────────────────────────────────────────────────────────────────

    def build_confidence_gauge(self, confidence_score: float):
        """Build a gauge chart showing extraction confidence."""
        try:
            import plotly.graph_objects as go
        except ImportError:
            return None

        fig = go.Figure(go.Indicator(
            mode="gauge+number",
            value=confidence_score * 100,
            title={'text': "Extraction Confidence", 'font': {'size': 16}},
            gauge={
                'axis': {'range': [0, 100], 'tickwidth': 1},
                'bar': {'color': "#4ECDC4"},
                'steps': [
                    {'range': [0, 30], 'color': "#FF6B6B"},
                    {'range': [30, 70], 'color': "#FFEAA7"},
                    {'range': [70, 100], 'color': "#96CEB4"}
                ]
            }
        ))

        fig.update_layout(
            height=200,
            paper_bgcolor='rgba(0,0,0,0)',
            font={'color': 'white'},
            margin=dict(t=30, b=10, l=30, r=30)
        )

        return fig

    def build_health_gauge(self, health_score: int):
        """Build a gauge chart showing overall project health."""
        try:
            import plotly.graph_objects as go
        except ImportError:
            return None

        fig = go.Figure(go.Indicator(
            mode="gauge+number",
            value=health_score,
            title={'text': "Project Health", 'font': {'size': 20, 'color': '#4ECDC4'}},
            gauge={
                'axis': {'range': [0, 100]},
                'bar': {'color': "white"},
                'bgcolor': "rgba(0,0,0,0)",
                'steps': [
                    {'range': [0, 40], 'color': "#FF6B6B"},
                    {'range': [40, 75], 'color': "#FFEAA7"},
                    {'range': [75, 100], 'color': "#4ECDC4"}
                ],
                'threshold': {
                    'line': {'color': "white", 'width': 4},
                    'thickness': 0.75,
                    'value': health_score
                }
            }
        ))

        fig.update_layout(
            height=250,
            paper_bgcolor='rgba(0,0,0,0)',
            font={'color': 'white'},
            margin=dict(t=50, b=20, l=20, r=20)
        )

        return fig

    # ────────────────────────────────────────────────────────────────────
    # DATABASE STATISTICS CHART
    # ────────────────────────────────────────────────────────────────────

    def build_db_stats_chart(self, stats: Dict):
        """Build a pie chart showing database composition."""
        try:
            import plotly.graph_objects as go
        except ImportError:
            return None

        labels = ['Emails', 'Meetings', 'Chats', 'Noise Filtered']
        values = [
            stats.get("total_emails", 0),
            stats.get("total_meetings", 0),
            stats.get("total_chats", 0),
            stats.get("total_noise_filtered", 0)
        ]

        colors = ['#4ECDC4', '#45B7D1', '#96CEB4', '#FF6B6B']

        fig = go.Figure(go.Pie(
            labels=labels,
            values=values,
            hole=0.4,
            marker=dict(colors=colors, line=dict(color='white', width=2)),
            textinfo='label+percent',
            textfont=dict(size=12)
        ))

        fig.update_layout(
            title=dict(text="Communication Types Distribution", font=dict(size=16)),
            paper_bgcolor='rgba(0,0,0,0)',
            height=400,
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=-0.2)
        )

        return fig


# ============================================================================
# MAIN (test)
# ============================================================================

if __name__ == "__main__":
    viz = BRDVisualizer()

    sample_brd = {
        "project_topic": "Project Alpha",
        "requirements": ["API must support JSON", "OAuth 2.0 auth required"],
        "decisions": ["Use PostgreSQL"],
        "stakeholders": [
            {"name": "John Smith", "role": "PM"},
            {"name": "Sarah Jones", "role": "Tech Lead"},
            {"name": "Mike Chen", "role": "Developer"}
        ],
        "timelines": [
            {"date": "March 15", "milestone": "Data Migration"},
            {"date": "April 30", "milestone": "API Migration"},
        ],
        "action_items": ["Sarah: API spec by Feb 20", "John: Review meeting March 1"],
        "feedback": ["Vendor timeline uncertain"],
        "conflicts": []
    }

    graph = viz.build_stakeholder_graph(sample_brd)
    print(f"Graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    print(json.dumps(graph, indent=2))
