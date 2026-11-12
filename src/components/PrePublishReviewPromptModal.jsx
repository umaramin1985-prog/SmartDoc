import React from 'react';
import { Modal } from './ui';
import { Users, Rocket, ArrowRight } from 'lucide-react';

export const PrePublishReviewPromptModal = ({
  title,
  onSendForReview,
  onPublishDirect,
  onClose,
  isPublishing = false,
  isEditingExisting = false
}) => {
  const handleKeyActivate = (action) => (e) => {
    if (isPublishing || !action) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <Modal
      id="modal-pre-publish-review-prompt"
      title={`Publish "${title || 'Untitled Form'}"`}
      subtitle="How would you like to publish this template?"
      onClose={isPublishing ? undefined : onClose}
      size="md"
    >
      <div className="sd-pre-publish-wrap">
        <div className="sd-pre-publish-options">
          {/* Option 1: Send for Review (Recommended) */}
          <div
            id="opt-send-for-review"
            className="sd-pre-publish-option-card recommended"
            onClick={!isPublishing ? onSendForReview : undefined}
            onKeyDown={handleKeyActivate(onSendForReview)}
            role="button"
            tabIndex={0}
          >
            <div className="sd-pre-publish-card-top">
              <div className="sd-pre-publish-icon-wrap accent">
                <Users size={18} />
              </div>
              <div className="sd-pre-publish-card-body">
                <div className="sd-pre-publish-title-row">
                  <h4 className="sd-pre-publish-heading">Send for Review First</h4>
                  <span className="sd-pre-publish-tag">Recommended</span>
                </div>
                <p className="sd-pre-publish-desc">
                  Let colleagues suggest edits before final publication.
                </p>
              </div>
              <ArrowRight size={16} className="sd-pre-publish-arrow" />
            </div>
          </div>

          {/* Option 2: Publish Directly */}
          <div
            id="opt-publish-direct"
            className="sd-pre-publish-option-card"
            onClick={!isPublishing ? onPublishDirect : undefined}
            onKeyDown={handleKeyActivate(onPublishDirect)}
            role="button"
            tabIndex={0}
          >
            <div className="sd-pre-publish-card-top">
              <div className="sd-pre-publish-icon-wrap">
                <Rocket size={18} />
              </div>
              <div className="sd-pre-publish-card-body">
                <div className="sd-pre-publish-title-row">
                  <h4 className="sd-pre-publish-heading">
                    {isPublishing ? 'Publishing…' : isEditingExisting ? 'Commit & Publish Immediately' : 'Publish Immediately'}
                  </h4>
                </div>
                <p className="sd-pre-publish-desc">
                  Make active and fillable in the department drive now.
                </p>
              </div>
              <ArrowRight size={16} className="sd-pre-publish-arrow" />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
