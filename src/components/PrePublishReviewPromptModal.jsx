import React from 'react';
import { Modal } from './ui';
import { Users, Rocket, ArrowRight, ShieldCheck } from 'lucide-react';

export const PrePublishReviewPromptModal = ({
  title,
  onSendForReview,
  onPublishDirect,
  onClose,
  isPublishing = false,
  isEditingExisting = false
}) => {
  return (
    <Modal
      id="modal-pre-publish-review-prompt"
      title="Send for Review Before Publishing?"
      subtitle={`Choose how you want to proceed with "${title || 'Untitled Form'}"`}
      onClose={isPublishing ? undefined : onClose}
      size="md"
      footer={(
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isPublishing}
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-pre-publish-direct"
            className="btn btn-secondary"
            onClick={onPublishDirect}
            disabled={isPublishing}
            title="Publish immediately without sending for review"
          >
            <Rocket size={14} /> {isPublishing ? 'Publishing…' : isEditingExisting ? 'Commit & Publish Directly' : 'Publish Directly'}
          </button>
          <button
            type="button"
            id="btn-pre-publish-send-review"
            className="btn btn-primary"
            onClick={onSendForReview}
            disabled={isPublishing}
            title="Choose reviewers to propose changes before final publication"
          >
            <Users size={15} /> Send for Review
          </button>
        </>
      )}
    >
      <div className="sd-pre-publish-wrap">
        <p className="sd-pre-publish-intro">
          Before publishing this document to the department drive, would you like to send it out to colleagues for review and suggested edits?
        </p>

        <div className="sd-pre-publish-options">
          {/* Option 1: Send for Review (Recommended) */}
          <div
            id="opt-send-for-review"
            className="sd-pre-publish-option-card recommended"
            onClick={!isPublishing ? onSendForReview : undefined}
            role="button"
            tabIndex={0}
          >
            <div className="sd-pre-publish-card-top">
              <div className="sd-pre-publish-icon-wrap accent">
                <Users size={20} />
              </div>
              <div className="sd-pre-publish-card-body">
                <div className="sd-pre-publish-title-row">
                  <h4 className="sd-pre-publish-heading">Send for Review</h4>
                  <span className="sd-pre-publish-tag">Recommended</span>
                </div>
                <p className="sd-pre-publish-desc">
                  Invite colleagues to edit their own copy of this document. You will be able to review, accept, or reject each change before final publication.
                </p>
              </div>
            </div>
            <div className="sd-pre-publish-card-action">
              <span className="sd-link sd-pre-publish-action-link">
                Choose reviewers &amp; send <ArrowRight size={13} />
              </span>
            </div>
          </div>

          {/* Option 2: Publish Directly */}
          <div
            id="opt-publish-direct"
            className="sd-pre-publish-option-card"
            onClick={!isPublishing ? onPublishDirect : undefined}
            role="button"
            tabIndex={0}
          >
            <div className="sd-pre-publish-card-top">
              <div className="sd-pre-publish-icon-wrap">
                <Rocket size={20} />
              </div>
              <div className="sd-pre-publish-card-body">
                <div className="sd-pre-publish-title-row">
                  <h4 className="sd-pre-publish-heading">Publish Directly</h4>
                </div>
                <p className="sd-pre-publish-desc">
                  Skip peer review and make this document immediately active and fillable in the department drive.
                </p>
              </div>
            </div>
            <div className="sd-pre-publish-card-action">
              <span className="sd-muted sd-pre-publish-action-link">
                Publish without review <ArrowRight size={13} />
              </span>
            </div>
          </div>
        </div>

        <div className="sd-pre-publish-note">
          <ShieldCheck size={14} className="sd-text-good" />
          <span>Department workflows and audit logging will be activated upon publication.</span>
        </div>
      </div>
    </Modal>
  );
};
