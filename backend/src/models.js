import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = r => ({ type: Schema.Types.ObjectId, ref: r });
const T = { timestamps: true };

export const User = model('User', new Schema({
  name: String, email: { type: String, unique: true, lowercase: true, index: true }, passwordHash: String,
  role: { type: String, enum: ['admin', 'devops', 'developer'], default: 'developer' },
  status: { type: String, enum: ['active', 'suspended', 'invited'], default: 'active' },
  resetTokenHash: String, resetExpires: Date, failedLogins: { type: Number, default: 0 }, lockUntil: Date, lastLoginAt: Date,
  prefs: { muted: { type: [String], default: [] }, email: { type: Boolean, default: false } },
}, T));

export const Project = model('Project', new Schema({
  name: { type: String, required: true }, key: { type: String, unique: true, uppercase: true }, description: String,
  owner: ref('User'), members: [ref('User')], status: { type: String, enum: ['active', 'archived'], default: 'active' },
  githubRepo: String, jenkinsJob: String, deployJob: String, sonarKey: String, imageName: String,
  environments: { type: [{ name: String, type: { type: String, enum: ['development', 'staging', 'production'] } }],
    default: [{ name: 'development', type: 'development' }, { name: 'staging', type: 'staging' }, { name: 'production', type: 'production' }] },
  policy: { blockOnQualityGate: { type: Boolean, default: true }, blockOnCritical: { type: Boolean, default: true },
    blockOnSecrets: { type: Boolean, default: true }, requireApprovalProd: { type: Boolean, default: true },
    autoTriggerOnPush: { type: Boolean, default: true }, developerCanTrigger: { type: Boolean, default: false } },
}, T));

export const Integration = model('Integration', new Schema({
  type: { type: String, unique: true, enum: ['github', 'jenkins', 'sonarqube', 'trivy', 'gitleaks', 'docker', 'prometheus', 'grafana', 'ai'] },
  baseUrl: String, username: String, secretEnc: String, extra: Schema.Types.Mixed, enabled: { type: Boolean, default: true },
  status: { type: String, default: 'unknown' }, lastCheckAt: Date, lastError: String,
}, T));

export const Build = model('Build', new Schema({
  project: { ...ref('Project'), index: true }, job: String, number: Number, status: String, branch: String, commit: String,
  startedAt: Date, duration: Number, url: String, stages: [{ name: String, status: String, startedAt: Date, duration: Number, error: String }],
}, T).index({ project: 1, number: 1 }, { unique: true }));

export const Finding = model('Finding', new Schema({
  project: { ...ref('Project'), index: true }, source: { type: String, enum: ['trivy', 'gitleaks'] }, target: String, vulnId: String, title: String,
  severity: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] }, pkg: String, installedVersion: String, fixedVersion: String,
  url: String, maskedSecret: String, commit: String, author: String, fingerprint: String,
  status: { type: String, enum: ['open', 'acknowledged', 'resolved', 'ignored'], default: 'open' },
  resolvedBy: String, resolvedNote: String, resolvedAt: Date, firstSeen: Date, lastSeen: Date, scanId: String,
}, T).index({ project: 1, fingerprint: 1 }, { unique: true }));

export const QualityReport = model('QualityReport', new Schema({
  project: { ...ref('Project'), index: true }, branch: String, gate: String, conditions: Schema.Types.Mixed,
  metrics: { bugs: Number, vulnerabilities: Number, codeSmells: Number, coverage: Number, duplication: Number, techDebtMin: Number, hotspots: Number }, url: String,
}, T));

export const Deployment = model('Deployment', new Schema({
  project: { ...ref('Project'), index: true }, environment: String, envType: String, version: String, commit: String, build: ref('Build'),
  status: { type: String, enum: ['blocked', 'pending_approval', 'approved', 'deploying', 'succeeded', 'failed', 'rejected', 'rolled_back'], default: 'pending_approval' },
  requestedBy: ref('User'), approvedBy: ref('User'), blockedReasons: [String], notes: String, rollbackOf: ref('Deployment'), finishedAt: Date,
}, T));

export const Notification = model('Notification', new Schema({
  type: String, severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' }, title: String, message: String,
  project: ref('Project'), link: String, readBy: [ref('User')], audience: { type: [String], default: [] },
}, T));

export const Activity = model('Activity', new Schema({
  type: String, status: String, title: String, project: ref('Project'), link: String, at: { type: Date, default: Date.now, index: true },
}));

const auditSchema = new Schema({
  at: { type: Date, default: Date.now, index: true }, actor: ref('User'), actorLabel: String, action: String, target: String,
  outcome: { type: String, enum: ['success', 'failure', 'denied'] }, ip: String, meta: Schema.Types.Mixed,
});
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany']
  .forEach(op => auditSchema.pre(op, function () { throw new Error('Audit records are immutable'); }));
auditSchema.pre('save', function (next) { next(this.isNew ? undefined : new Error('Audit records are immutable')); });
export const AuditLog = model('AuditLog', auditSchema);

export const WebhookDelivery = model('WebhookDelivery', new Schema({
  deliveryId: { type: String, unique: true }, event: String, createdAt: { type: Date, default: Date.now, expires: 7 * 86400 },
}));

export const Report = model('Report', new Schema({
  title: String, project: ref('Project'), createdBy: ref('User'), params: Schema.Types.Mixed, file: String, size: Number,
}, T));
