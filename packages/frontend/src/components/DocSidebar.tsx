import { CheckSquare, Edit2, Eye, FileText, LayoutTemplate, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { useWebSocketContext } from "../sdk/context/WebSocketContext";
import type { DocType } from "../sdk/store/slices/docSlice";

const DocSidebar: React.FC = () => {
  const { store } = useWebSocketContext();
  const docState = store((state) => state.docState);
  const closeDoc = store((state) => state.closeDoc);
  const setActiveDoc = store((state) => state.setActiveDoc);
  const updateDocContent = store((state) => state.updateDocContent);

  const { isOpen, activeDoc, documents } = docState;
  // Fallback to taskList if activeDoc or documents is somehow not initialized correctly
  // This guards against potential state mismatch during hot reload or migration
  const currentDoc = documents?.[activeDoc] || documents?.taskList || { content: "", title: "" };

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [shouldRender, setShouldRender] = useState(false);

  const hasAnyContent =
    (documents?.requirements?.content && documents.requirements.content.trim() !== "") ||
    (documents?.design?.content && documents.design.content.trim() !== "") ||
    (documents?.taskList?.content && documents.taskList.content.trim() !== "");

  const shouldShow = isOpen && hasAnyContent;

  // Handle delayed unmount for animation
  useEffect(() => {
    if (shouldShow) {
      setShouldRender(true);
    } else {
      // Delay unmount to allow animation to complete
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (currentDoc.content) {
      setEditContent(currentDoc.content);
    } else {
      setEditContent("");
    }
  }, [currentDoc.content, activeDoc]);

  if (!shouldRender) return null;

  const handleSave = () => {
    updateDocContent(activeDoc, editContent);
    setIsEditing(false);
  };

  const tabs: { type: DocType; label: string; icon: React.ReactNode }[] = [
    { type: "requirements", label: "Requirements", icon: <FileText className="w-4 h-4" /> },
    { type: "design", label: "Design", icon: <LayoutTemplate className="w-4 h-4" /> },
    { type: "taskList", label: "Tasks", icon: <CheckSquare className="w-4 h-4" /> },
  ];

  return (
    <div
      className={`
        h-full flex flex-col border-l border-gray-200 bg-white shadow-xl z-10
        transition-all duration-300 ease-in-out overflow-hidden
        ${shouldShow ? "w-[450px]" : "w-0"}
      `}
    >
      <div className="w-[450px] h-full flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between gap-1.5 p-1 bg-gray-100/50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.type}
                  onClick={() => {
                    setActiveDoc(tab.type);
                    setIsEditing(false);
                  }}
                  className={`
                  flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
                  ${
                    activeDoc === tab.type
                      ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
                  }
                `}
                >
                  <span className="shrink-0">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 pr-1">
              <button
                onClick={() => {
                  if (isEditing) handleSave();
                  else setIsEditing(true);
                }}
                className="flex items-center space-x-1 text-xs font-medium text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                {isEditing ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Preview</span>
                  </>
                ) : (
                  <>
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Edit</span>
                  </>
                )}
              </button>

              <div className="w-px h-4 bg-gray-300 mx-1" />

              <button
                onClick={closeDoc}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-white">
          {isEditing ? (
            <textarea
              className="w-full h-full p-4 resize-none focus:outline-none text-sm font-mono text-neutral-800 leading-relaxed"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder={`Enter ${tabs.find((t) => t.type === activeDoc)?.label.toLowerCase()} here...`}
            />
          ) : (
            <div className="p-4 prose prose-sm max-w-none prose-neutral">
              {currentDoc.content ? (
                <Streamdown>{currentDoc.content}</Streamdown>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-neutral-400 space-y-2">
                  <FileText className="w-8 h-8 opacity-20" />
                  <span className="text-sm">No content yet</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-blue-500 hover:underline text-xs"
                  >
                    Start writing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocSidebar;
