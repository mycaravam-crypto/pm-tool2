import { defineStore } from 'pinia';
import { api } from '../lib/api.js';

export const useProjectStore = defineStore('project', {
  state: () => ({
    currentMember: null,
    projects: [],
    stakeholders: [],
    members: [],
    notifications: [],
    selectedProjectIds: [],
    events: [],
    scopedSummary: { overdue_action_items: 0, open_high_severity_pain_points: 0, upcoming_deadlines: 0 },
    portfolioSummary: { overdue_action_items: 0, open_high_severity_pain_points: 0, upcoming_deadlines: 0 },
    loading: false,
    error: null,
  }),

  getters: {
    selectedProjects: (state) => state.projects.filter((p) => state.selectedProjectIds.includes(p.id)),
    projectById: (state) => (id) => state.projects.find((p) => p.id === id),
    stakeholderById: (state) => (id) => state.stakeholders.find((s) => s.id === id),
    sortedEvents: (state) => [...state.events].sort((a, b) => a.date.localeCompare(b.date)),
    isAdmin: (state) => state.currentMember?.role === 'admin',
  },

  actions: {
    setCurrentMember(member) {
      this.currentMember = member;
    },

    async logout() {
      await api.auth.logout();
      this.currentMember = null;
    },

    async init() {
      // Stakeholder Directory and Members management are admin-only server-side
      // (PLAN.md Section 3.H) — fetching them as a non-admin would 403 and blow up
      // this Promise.all, so they're conditional here rather than always-on.
      const tasks = [this.fetchProjects(), this.fetchPortfolioSummary(), this.fetchNotifications()];
      if (this.isAdmin) tasks.push(this.fetchStakeholders(), this.fetchMembers());
      await Promise.all(tasks);
    },

    async fetchProjects() {
      this.projects = await api.projects.list('active');
    },

    async fetchStakeholders() {
      this.stakeholders = await api.stakeholders.list();
    },

    async fetchMembers() {
      this.members = await api.members.list();
    },

    async fetchNotifications() {
      this.notifications = await api.notifications.list();
    },

    // Pushed live over WebSocket (see lib/ws.js). A subsequent fetchNotifications()
    // triggered by whatever mutation caused this (e.g. the user's own addPainPoint)
    // will replace this with the authoritative list moments later, so a duplicate
    // here is at most a brief visual flash, never a lasting one.
    receiveNotification(notification) {
      this.notifications = [notification, ...this.notifications];
    },

    async createMember(data) {
      await api.members.create(data);
      await this.fetchMembers();
    },
    async updateMember(id, data) {
      await api.members.update(id, data);
      await this.fetchMembers();
    },
    async deleteMember(id) {
      await api.members.remove(id);
      await this.fetchMembers();
    },
    async subscribeMemberToProject(memberId, projectId) {
      await api.members.subscribe(memberId, projectId);
    },
    async unsubscribeMemberFromProject(memberId, projectId) {
      await api.members.unsubscribe(memberId, projectId);
    },
    async runDigestNow() {
      const result = await api.notifications.runDigest();
      await this.fetchNotifications();
      return result;
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
        this.selectedProjectIds = this.selectedProjectIds.filter((id) => id !== projectId);
      } else {
        this.selectedProjectIds = [...this.selectedProjectIds, projectId];
      }
      await Promise.all([this.fetchEvents(), this.fetchScopedSummary()]);
    },

    // Used when drilling into a portfolio-wide stat (Health Summary) with no
    // project selected yet — the dashboard only ever shows selected projects,
    // so "show me these across the portfolio" means selecting all of them.
    async selectAllProjects() {
      this.selectedProjectIds = this.projects.map((p) => p.id);
      await Promise.all([this.fetchEvents(), this.fetchScopedSummary()]);
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
      await Promise.all([
        this.fetchProjects(),
        this.fetchEvents(),
        this.fetchScopedSummary(),
        this.fetchPortfolioSummary(),
        this.fetchNotifications(),
      ]);
    },

    async createProject(data) {
      await api.projects.create(data);
      await Promise.all([this.fetchProjects(), this.fetchPortfolioSummary()]);
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
      this.selectedProjectIds = this.selectedProjectIds.filter((pid) => pid !== id);
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
      await Promise.all([this.fetchStakeholders(), this.fetchEvents()]);
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

    // The fetches below are all independent reads (different endpoints, none
    // depending on another's result), so they run via Promise.all rather than
    // sequential awaits — each stacked await was a full extra network round
    // trip of added latency on every single mutation, most noticeably on the
    // Overview tab's done/resolved checkboxes, which fire these constantly.
    async addDecision(data) {
      await api.decisions.create(data);
      await Promise.all([this.fetchEvents(), this.fetchNotifications()]);
    },
    async updateDecision(id, data) {
      await api.decisions.update(id, data);
      await Promise.all([this.fetchEvents(), this.fetchNotifications()]);
    },
    async deleteDecision(id) {
      await api.decisions.remove(id);
      await this.fetchEvents();
    },

    async addActionItem(data) {
      await api.actionItems.create(data);
      await Promise.all([
        this.fetchEvents(),
        this.fetchScopedSummary(),
        this.fetchPortfolioSummary(),
        this.fetchNotifications(),
      ]);
    },
    async updateActionItem(id, data) {
      await api.actionItems.update(id, data);
      await Promise.all([this.fetchEvents(), this.fetchNotifications()]);
    },
    async toggleActionItemDone(id, done) {
      await api.actionItems.toggleDone(id, done);
      await Promise.all([this.fetchEvents(), this.fetchScopedSummary(), this.fetchPortfolioSummary()]);
    },
    async deleteActionItem(id) {
      await api.actionItems.remove(id);
      await Promise.all([this.fetchEvents(), this.fetchScopedSummary(), this.fetchPortfolioSummary()]);
    },

    async addPainPoint(data) {
      await api.painPoints.create(data);
      await Promise.all([
        this.fetchEvents(),
        this.fetchScopedSummary(),
        this.fetchPortfolioSummary(),
        this.fetchProjects(),
        this.fetchNotifications(),
      ]);
    },
    async updatePainPoint(id, data) {
      await api.painPoints.update(id, data);
      await Promise.all([this.fetchEvents(), this.fetchProjects(), this.fetchNotifications()]);
    },
    async togglePainPointResolved(id, resolved) {
      await api.painPoints.toggleResolved(id, resolved);
      await Promise.all([
        this.fetchEvents(),
        this.fetchScopedSummary(),
        this.fetchPortfolioSummary(),
        this.fetchProjects(),
      ]);
    },
    async deletePainPoint(id) {
      await api.painPoints.remove(id);
      await Promise.all([
        this.fetchEvents(),
        this.fetchScopedSummary(),
        this.fetchPortfolioSummary(),
        this.fetchProjects(),
      ]);
    },

    // Requirements/goals are project-scoped, not event-scoped, and are delivered
    // nested on GET /api/projects (like lead/scorecard) rather than through a
    // separate fetch — so a single fetchProjects() refresh is all these need.
    async addRequirement(data) {
      await api.requirements.create(data);
      await this.fetchProjects();
    },
    async updateRequirement(id, data) {
      await api.requirements.update(id, data);
      await this.fetchProjects();
    },
    async toggleRequirementDone(id, done) {
      await api.requirements.toggleDone(id, done);
      await this.fetchProjects();
    },
    async deleteRequirement(id) {
      await api.requirements.remove(id);
      await this.fetchProjects();
    },

    async addGoal(data) {
      await api.goals.create(data);
      await this.fetchProjects();
    },
    async updateGoal(id, data) {
      await api.goals.update(id, data);
      await this.fetchProjects();
    },
    async toggleGoalAchieved(id, achieved) {
      await api.goals.toggleAchieved(id, achieved);
      await this.fetchProjects();
    },
    async deleteGoal(id) {
      await api.goals.remove(id);
      await this.fetchProjects();
    },
  },
});
