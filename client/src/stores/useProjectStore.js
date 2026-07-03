import { defineStore } from 'pinia';
import { api } from '../lib/api.js';

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [],
    stakeholders: [],
    selectedProjectIds: [],
    events: [],
    scopedSummary: { overdue_action_items: 0, open_high_severity_pain_points: 0, upcoming_deadlines: 0 },
    portfolioSummary: { overdue_action_items: 0, open_high_severity_pain_points: 0, upcoming_deadlines: 0 },
    loading: false,
    error: null
  }),

  getters: {
    selectedProjects: (state) => state.projects.filter(p => state.selectedProjectIds.includes(p.id)),
    projectById: (state) => (id) => state.projects.find(p => p.id === id),
    stakeholderById: (state) => (id) => state.stakeholders.find(s => s.id === id),
    sortedEvents: (state) => [...state.events].sort((a, b) => a.date.localeCompare(b.date))
  },

  actions: {
    async init() {
      await Promise.all([this.fetchProjects(), this.fetchStakeholders(), this.fetchPortfolioSummary()]);
    },

    async fetchProjects() {
      this.projects = await api.projects.list('active');
    },

    async fetchStakeholders() {
      this.stakeholders = await api.stakeholders.list();
    },

    async fetchPortfolioSummary() {
      this.portfolioSummary = await api.dashboard.summary();
    },

    async fetchScopedSummary() {
      if (this.selectedProjectIds.length === 0) {
        this.scopedSummary = { overdue_action_items: 0, open_high_severity_pain_points: 0, upcoming_deadlines: 0 };
        return;
      }
      this.scopedSummary = await api.dashboard.summary(this.selectedProjectIds);
    },

    async toggleProjectSelection(projectId) {
      if (this.selectedProjectIds.includes(projectId)) {
        this.selectedProjectIds = this.selectedProjectIds.filter(id => id !== projectId);
      } else {
        this.selectedProjectIds = [...this.selectedProjectIds, projectId];
      }
      await this.fetchEvents();
      await this.fetchScopedSummary();
    },

    async fetchEvents() {
      if (this.selectedProjectIds.length === 0) {
        this.events = [];
        return;
      }
      this.loading = true;
      try {
        this.events = await api.events.list(this.selectedProjectIds);
      } finally {
        this.loading = false;
      }
    },

    async refreshAll() {
      await Promise.all([this.fetchProjects(), this.fetchEvents(), this.fetchScopedSummary(), this.fetchPortfolioSummary()]);
    },

    async createProject(data) {
      await api.projects.create(data);
      await this.fetchProjects();
      await this.fetchPortfolioSummary();
    },

    async updateProject(id, data) {
      await api.projects.update(id, data);
      await this.fetchProjects();
    },

    async setProjectLead(id, stakeholderId) {
      await api.projects.setLead(id, stakeholderId);
      await this.fetchProjects();
    },

    async deleteProject(id) {
      await api.projects.remove(id);
      this.selectedProjectIds = this.selectedProjectIds.filter(pid => pid !== id);
      await this.refreshAll();
    },

    async assignStakeholderToProject(projectId, stakeholderId, role) {
      await api.projects.assignStakeholder(projectId, stakeholderId, role);
    },

    async createStakeholder(data) {
      await api.stakeholders.create(data);
      await this.fetchStakeholders();
    },

    async updateStakeholder(id, data) {
      await api.stakeholders.update(id, data);
      await this.fetchStakeholders();
    },

    async deleteStakeholder(id) {
      await api.stakeholders.remove(id);
      await this.fetchStakeholders();
      await this.fetchEvents();
    },

    async createEvent(data) {
      await api.events.create(data);
      await this.refreshAll();
    },

    async updateEvent(id, data) {
      await api.events.update(id, data);
      await this.refreshAll();
    },

    async deleteEvent(id) {
      await api.events.remove(id);
      await this.refreshAll();
    },

    async addDecision(data) {
      await api.decisions.create(data);
      await this.fetchEvents();
    },
    async updateDecision(id, data) {
      await api.decisions.update(id, data);
      await this.fetchEvents();
    },
    async deleteDecision(id) {
      await api.decisions.remove(id);
      await this.fetchEvents();
    },

    async addActionItem(data) {
      await api.actionItems.create(data);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
    },
    async updateActionItem(id, data) {
      await api.actionItems.update(id, data);
      await this.fetchEvents();
    },
    async toggleActionItemDone(id, done) {
      await api.actionItems.toggleDone(id, done);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
    },
    async deleteActionItem(id) {
      await api.actionItems.remove(id);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
    },

    async addPainPoint(data) {
      await api.painPoints.create(data);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
      await this.fetchProjects();
    },
    async updatePainPoint(id, data) {
      await api.painPoints.update(id, data);
      await this.fetchEvents();
      await this.fetchProjects();
    },
    async togglePainPointResolved(id, resolved) {
      await api.painPoints.toggleResolved(id, resolved);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
      await this.fetchProjects();
    },
    async deletePainPoint(id) {
      await api.painPoints.remove(id);
      await this.fetchEvents();
      await this.fetchScopedSummary();
      await this.fetchPortfolioSummary();
      await this.fetchProjects();
    }
  }
});
