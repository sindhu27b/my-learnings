import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown, BookOpen, Clock, Search, Menu, ArrowLeft, Zap, Code, Cloud,
  Monitor, Settings, LayoutDashboard, FileText, User, Users, ClipboardCheck,
  HelpCircle, Feather, ArrowRight, X, Trash2, Edit, Save, PlusCircle, Globe
} from 'lucide-react';
// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
// Removed getAnalytics as it wasn't being used
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  setLogLevel
} from "firebase/firestore";

// --- Quill Rich Text Editor Loader ---

const QUILL_JS_URL = "https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js";
const QUILL_CSS_URL = "https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css";
// Added for Code Snippets
const HIGHLIGHT_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
const HIGHLIGHT_CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";


// Use a simple flag to avoid re-loading
let quillLoadingPromise = null;

// Function to load a script
const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        // Check if script is already present or loading
        if (document.querySelector(`script[src="${src}"]`)) {
            // If it's already loaded, window.Quill should exist
            if(src === QUILL_JS_URL && window.Quill) {
                return resolve();
            }
             if(src === HIGHLIGHT_JS_URL && window.hljs) {
                return resolve();
            }
            // If not, it's still loading; wait for it
            const script = document.querySelector(`script[src="${src}"]`);
            script.addEventListener('load', () => resolve());
            script.addEventListener('error', () => reject(new Error(`Failed to load script ${src}`)));
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script ${src}`));
        document.head.appendChild(script);
    });
};

// Function to load a stylesheet
const loadStylesheet = (href) => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`link[href="${href}"]`)) {
            return resolve();
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load stylesheet ${href}`));
        document.head.appendChild(link);
    });
};

// This function ensures Quill is loaded only once
const loadQuill = () => {
    if (window.Quill) {
        return Promise.resolve();
    }
    if (quillLoadingPromise) {
        return quillLoadingPromise;
    }
    // Load Highlight.js *before* Quill.js
    // CSS is loaded separately in the main App component
    quillLoadingPromise = loadScript(HIGHLIGHT_JS_URL)
        .then(() => loadScript(QUILL_JS_URL))
        .then(() => {
            quillLoadingPromise = null;
        }).catch(error => {
            console.error("Failed to load Quill or Highlight.js:", error);
            quillLoadingPromise = null;
            throw error;
        });
    return quillLoadingPromise;
};

const RichTextEditor = ({ value, onChange }) => {
    const [isLoading, setIsLoading] = useState(true);
    const editorWrapperRef = React.useRef(null);
    const quillInstanceRef = React.useRef(null);
    const onChangeRef = React.useRef(onChange); // Ref to hold the latest onChange
    const isUserChange = React.useRef(false); // Ref to track if the change came from the user

    // Update the ref whenever onChange prop changes
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Toolbar configuration
    const modules = useMemo(() => ({
        toolbar: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'size': ['small', false, 'large', 'huge'] }], // Size dropdown
            ['bold', 'italic', 'underline', 'strike'],       // Toggled buttons
            [{ 'color': [] }, { 'background': [] }],       // Color dropdowns
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'align': [] }],
            ['link', 'image', 'code-block'],           // MODIFIED: Added 'code-block'
            ['clean']                                         // Remove formatting
        ],
        syntax: true, // Enable syntax highlighting module
    }), []);

    // Effect to load Quill
    useEffect(() => {
        loadQuill().then(() => {
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            // Handle load error, e.g., show a message
        });
    }, []);

    // Effect to initialize Quill instance
    useEffect(() => {
        if (isLoading || !editorWrapperRef.current || !window.Quill || quillInstanceRef.current) {
            return; // Wait for loading, ref, Quill, and prevent re-init
        }
        
        // Quill creates its own editor div, so we clear the wrapper first
        editorWrapperRef.current.innerHTML = ''; 
        const editorDiv = document.createElement('div');
        editorWrapperRef.current.appendChild(editorDiv);

        const quill = new window.Quill(editorDiv, {
            modules: modules,
            theme: 'snow'
        });

        // Set initial value
        if (value) {
            quill.clipboard.dangerouslyPasteHTML(value);
        }

        // Setup change handler
        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                isUserChange.current = true; // Flag that this change is from the user
                if (onChangeRef.current) {
                    onChangeRef.current(quill.root.innerHTML);
                }
            }
        });

        quillInstanceRef.current = quill;

        // Cleanup
        return () => {
            quillInstanceRef.current = null;
            if (editorWrapperRef.current) {
                editorWrapperRef.current.innerHTML = '';
            }
        };
    }, [isLoading, modules]); // Removed onChange from dependencies
    
    // This effect updates the editor if the `value` prop changes from outside
    useEffect(() => {
        if (quillInstanceRef.current) {
            // If the user just typed, the flag will be true. Don't update.
            if (isUserChange.current) {
                isUserChange.current = false; // Reset the flag
                return;
            }

            // If the change came from "outside" (e.g., loading a new doc)
            // and the content is different, update the editor.
            if (value !== quillInstanceRef.current.root.innerHTML) {
                const currentSelection = quillInstanceRef.current.getSelection();
                // Use clipboard.dangerouslyPasteHTML to set content, as it handles rich text
                // Set value to an empty string if it's null or undefined to avoid errors
                quillInstanceRef.current.clipboard.dangerouslyPasteHTML(value || '');
                // Restore selection after paste
                if (currentSelection) {
                     setTimeout(() => {
                         if (quillInstanceRef.current) {
                             try {
                                 quillInstanceRef.current.setSelection(currentSelection);
                             } catch (e) {
                                 // Fails if editor is no longer in DOM, which is fine
                             }
                         }
                     }, 0);
                }
            }
        }
    }, [value]); // Only run when the value prop changes

    if (isLoading) {
        return <div className="p-4 text-center text-gray-500 rounded-lg bg-gray-50 border border-gray-300">Loading Editor...</div>;
    }

    return (
        // This wrapper will contain the Quill editor and its toolbar
        // Quill's 'snow' theme CSS will style it
        <div ref={editorWrapperRef} className="quill-editor-container bg-white text-gray-900"/>
    );
};

// --- End Rich Text Editor ---


// --- Icon Component ---
/**
 * Renders a dynamic icon based on a string name.
 * This allows icons to be stored as JSON-safe strings.
 */
const DynamicIcon = ({ name, colorClass }) => {
  const iconMap = {
    Zap: Zap,
    Monitor: Monitor,
  };
  const IconComponent = iconMap[name] || HelpCircle; // Default to HelpCircle if name is not found
  return <IconComponent className={`w-6 h-6 ${colorClass}`} />;
};

// --- Core App Views ---
const APP_VIEWS = {
  HOME: 'Home',
  COURSE_DETAIL: 'CourseDetail',
  ARTICLE_VIEW: 'ArticleView',
  ASSESSMENT_HOME: 'AssessmentHome', 
  ASSESSMENT_VIEW: 'AssessmentView', 
  BLOG_HOME: 'BlogHome',
  BLOG_ARTICLE: 'BlogArticleView',
  ADMIN_PANEL: 'AdminPanel'
};

// --- Admin Panel Sub-Views ---
const ADMIN_VIEWS = {
  COURSES: 'AdminCourses',
  ASSESSMENTS: 'AdminAssessments',
  BLOGS: 'AdminBlogs',
  USERS: 'AdminUsers'
};


// --- Utility Components ---

/**
 * Renders a standard modal for displaying messages.
 */
const CustomModal = ({ title, message, onClose, type = 'info' }) => {
    // Determine colors based on type
    let titleColor = 'text-gray-900';
    let buttonClass = 'bg-indigo-700 hover:bg-indigo-800';
    let topBorderClass = 'border-indigo-500'; // Default info border

    if (type === 'success') {
        titleColor = 'text-green-700';
        buttonClass = 'bg-green-600 hover:bg-green-700';
        topBorderClass = 'border-green-500';
    } else if (type === 'error') {
        titleColor = 'text-red-700';
        buttonClass = 'bg-red-600 hover:bg-red-700';
        topBorderClass = 'border-red-500';
    }

    return (
        <div className="fixed inset-0 bg-white bg-opacity-50 z-[100] flex justify-center items-center p-4">
            <div className={`bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4 border border-gray-200 border-t-4 ${topBorderClass}`}>
                <h3 className={`text-xl font-bold ${titleColor}`}>{title}</h3>
                <p className="text-gray-600">{message}</p>
                <button
                    onClick={onClose}
                    className={`w-full text-white font-semibold py-2 rounded-lg transition ${buttonClass}`}
                >
                    Close
                </button>
            </div>
        </div>
    );
};

/**
 * Renders a modal to ask for the admin secret code.
 */
const SecretCodeModal = ({ onSubmit, onClose }) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(code);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex justify-center items-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4 border border-gray-200">
        <h3 className="text-xl font-bold text-gray-900">Enter Admin Secret Code</h3>
        <p className="text-sm text-gray-500">You must enter the secret code to access the admin dashboard.</p>
        <div>
          <label
            htmlFor="secretCode"
            className="text-sm font-medium text-gray-700 block mb-2"
          >
            Secret Code
          </label>
          <input
            type="password"
            id="secretCode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
            required
            autoFocus
          />
        </div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};


// --- Sub-Components (Views) ---

/**
 * Generic button component for the sidebar navigation.
 */
const SidebarNavButton = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full p-3 rounded-lg transition text-sm font-medium ${
      isActive
        ? 'bg-indigo-100 text-indigo-700'
        : 'hover:bg-gray-100 text-gray-700'
    }`}
  >
    <Icon className="w-5 h-5 mr-3" />
    {label}
  </button>
);

/**
 * Renders the home page listing all available courses.
 */
const HomeView = ({ onSelectCourse, courses, onNavigate, adminMode, onEditCourse, onDeleteCourse }) => {
    const publishedCourses = courses.filter(course => course.isPublished || adminMode); // Show all if admin

    return (
        <div className="p-4 md:p-8 space-y-10">
            <header className="space-y-3 p-4 bg-white rounded-xl shadow-lg border border-gray-200">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900">
                    My Notes !
                </h1>
                {/* <p className="text-xl font-semibold text-indigo-700 max-w-3xl">
                    Let's learn and master the technologies that shape the future.
                </p> */}
            </header>

            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    {adminMode ? "All Courses" : "Top Picks"} ({publishedCourses.length} Courses)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {publishedCourses.map(course => (
                        <div
                            key={course.id}
                            className={`
                                bg-white rounded-xl p-5 shadow-lg border border-gray-200
                                border-t-4 flex flex-col justify-between
                                ${!course.isPublished && adminMode ? 'opacity-60 border-t-red-500' : 'border-t-indigo-700'}
                            `}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`font-semibold uppercase text-xs tracking-wider py-1 px-3 rounded-full ${
                                        course.isPublished ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                        {course.isPublished ? 'Published' : 'Draft'}
                                    </span>
                                    <div className="flex items-center text-sm text-gray-500">
                                        {/* Use DynamicIcon component */}
                                        <DynamicIcon name={course.iconName} colorClass={course.iconColor} />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-2">{course.title}</h3>
                                    <p className="text-xs text-gray-500">{course.level}</p>
                                </div>

                                <p className="text-sm text-gray-600 mb-4 line-clamp-3 h-16">{course.description}</p>
                            </div>

                            {/* Start Course Button */}
                            <div className="mt-4 pt-3 border-t border-gray-200">
                                {adminMode ? (
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => onEditCourse(course)}
                                            className="w-full bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition duration-150 shadow-md shadow-indigo-200 flex items-center justify-center cursor-pointer"
                                        >
                                            <Edit className="w-4 h-4 mr-2" /> Edit
                                        </button>
                                        <button
                                            onClick={() => onDeleteCourse(course.id)}
                                            className="w-full bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 transition duration-150 shadow-md shadow-red-200 flex items-center justify-center cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onSelectCourse(course)}
                                        className="w-full bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition duration-150 shadow-md shadow-indigo-200 flex items-center justify-center cursor-pointer"
                                    >
                                        <span className="text-sm uppercase tracking-wider">Start</span>
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

/**
 * Renders the detailed view of a selected course, including sections and lessons.
 */
const CourseDetailView = ({ course, onSelectLesson, onGoHome, onStartAssessment }) => {
  const [openSection, setOpenSection] = useState(course.sections?.[0]?.id);

  const totalLessons = course.sections?.reduce((acc, s) => acc + (s.lessons?.length || 0), 0) || 0;

  const toggleSection = (sectionId) => {
    setOpenSection(openSection === sectionId ? null : sectionId);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-start">
        <button
          onClick={onGoHome}
          className="flex items-center text-indigo-700 hover:text-indigo-800 transition text-sm md:text-base font-medium p-2 rounded-lg hover:bg-indigo-50"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          <span className="font-semibold">Back to all courses</span>
        </button>
      </div>

      <header className={`p-6 rounded-xl bg-white border-l-8 border-indigo-700 mb-8 shadow-lg border border-gray-200`}>
        <div className="flex items-center space-x-6 mb-2 text-indigo-700">
            <div className='flex items-center space-x-3'>
                {/* Use DynamicIcon component */}
                <DynamicIcon name={course.iconName} colorClass={course.iconColor} />
                <span className="uppercase text-xs font-bold tracking-wider">{course.level}</span>
            </div>
            <span className={`px-3 inline-flex text-xs leading-5 font-semibold rounded-full ${
                course.isPublished ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
                {course.isPublished ? 'Published' : 'Draft'}
            </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">{course.title}</h1>
        <p className="text-gray-600 mb-4">{course.description}</p>
        
        {/* Duration and Lesson Count */}
        <div className="flex items-center space-x-6 text-sm mt-3 text-gray-500">
          {/* <span className="flex items-center"><Clock className="w-4 h-4 mr-1"/> {course.duration}</span> */}
          <span className="flex items-center"><BookOpen className="w-4 h-4 mr-1"/> {totalLessons} Lessons</span>
        </div>

      </header>

      <h2 className="text-xl font-bold text-gray-900 mb-4">Course Content</h2>
      <section className="space-y-4">
        {course.sections?.map((section) => (
          <div key={section.id} className="bg-white rounded-xl overflow-hidden shadow-md border border-gray-200">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full text-left p-4 flex items-center justify-between text-gray-900 font-semibold hover:bg-gray-100 transition"
            >
              <span className="text-lg">{section.title}</span>
              <div className="flex items-center text-sm text-gray-500">
                <span>{section.lessons?.length || 0} Lessons</span>
                <ChevronDown
                  className={`w-5 h-5 ml-2 transition-transform ${
                    openSection === section.id ? 'transform rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {openSection === section.id && (
              <div className="border-t border-gray-200">
                {section.lessons?.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => onSelectLesson(course, lesson)}
                    className="w-full text-left p-4 pl-8 flex items-center text-gray-700 hover:bg-gray-50 transition border-b border-gray-100 last:border-b-0"
                  >
                    {/* // MODIFICATION: Show Globe icon for external docs */}
                    {lesson.type === 'externalDoc' ? (
                        <Globe className="w-4 h-4 mr-3 text-indigo-700" />
                    ) : (
                        <BookOpen className="w-4 h-4 mr-3 text-indigo-700" />
                    )}
                    <span className='truncate'>{lesson.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};

/**
 * Renders the content of a selected lesson/article.
 */
const ArticleView = ({ lesson, course, onBackToCourse }) => {
  return (
    <div className="p-4 md:p-8">
      <button
        onClick={() => onBackToCourse(course)}
        className="flex items-center text-indigo-700 hover:text-indigo-800 transition mb-6 text-sm md:text-base font-medium p-2 rounded-lg hover:bg-indigo-50"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        <span className="font-semibold">Back to {course.title}</span>
      </button>

      {/* MODIFICATION: Conditionally render rich text or external doc link */}
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-200 text-gray-900 ql-snow">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">{lesson.title}</h1>
        <div className="h-0.5 w-16 bg-indigo-700 mb-6"></div>
        
        {(!lesson.type || lesson.type === 'richText') ? (
            // Render Rich Text content
            <div
                className="max-w-none text-gray-800 space-y-4 leading-relaxed ql-editor"
                dangerouslySetInnerHTML={{ __html: lesson.content }}
            />
        ) : (
            // Render External Document link
            <div className="text-center py-10">
                <p className="text-lg text-gray-700 mb-6">This lesson is an external document.</p>
                <a
                    href={lesson.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-6 py-3 bg-indigo-700 text-white font-semibold rounded-lg hover:bg-indigo-800 transition shadow-lg"
                >
                    <Globe className="w-5 h-5 mr-2" />
                    Open Document in New Tab
                </a>
            </div>
        )}
      </div>
    </div>
  );
};

/**
 * Renders the list of all available assessments.
 */
const AssessmentHome = ({ assessments, onStartAssessment, courses, adminMode, onEditAssessment, onDeleteAssessment }) => (
    <div className="p-4 md:p-8 space-y-8">
        <h1 className="text-4xl font-bold text-gray-900 border-b border-gray-200 pb-4">Assessments</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assessments.map(assessment => {
                const course = courses.find(c => c.id === assessment.courseId);
                return (
                    <div
                        key={assessment.id}
                        className="bg-white p-5 rounded-xl shadow-lg border border-gray-200 flex flex-col justify-between"
                    >
                        <div>
                            <h2 className="text-xl font-bold text-indigo-700 mb-2 line-clamp-2">{assessment.title}</h2>
                            <p className="text-sm text-gray-500 mb-1">Type: {assessment.type}</p>
                            <p className="text-sm text-gray-500 mb-3">For: {course ? course.title : "N/A"}</p>
                            <p className="text-gray-700 mb-4 line-clamp-3">
                                {assessment.questions?.length || 0} questions to test your knowledge.
                            </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-200">
                            {adminMode ? (
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => onEditAssessment(assessment)}
                                        className="w-full bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition duration-150 shadow-md shadow-indigo-200 flex items-center justify-center cursor-pointer"
                                    >
                                        <Edit className="w-4 h-4 mr-2" /> Edit
                                    </button>
                                    <button
                                        onClick={() => onDeleteAssessment(assessment.id)}
                                        className="w-full bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 transition duration-150 shadow-md shadow-red-200 flex items-center justify-center cursor-pointer"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onStartAssessment(assessment.id)}
                                    className="w-full bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 transition duration-150 shadow-md shadow-green-200 flex items-center justify-center cursor-pointer"
                                >
                                    <ClipboardCheck className="w-5 h-5 mr-2" /> Start Assessment
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

/**
 * Renders the quiz or assessment view.
 */
const AssessmentView = ({ assessment, onAssessmentComplete, onBackToCourse, courses }) => {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState(0);

    // Ensure assessment.questions is an array before proceeding
    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    const question = questions[currentQuestionIndex];
    const totalQuestions = questions.length;

    const handleAnswerSelect = (option) => {
        if (!isSubmitted) {
            setSelectedAnswers(prev => ({ ...prev, [question.id]: option }));
        }
    };

    const handleNext = () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
    };

    const handleSubmit = () => {
        let newScore = 0;
        questions.forEach(q => {
            if (selectedAnswers[q.id] === q.answer) {
                newScore++;
            }
        });
        setScore(newScore);
        setIsSubmitted(true);
    };

    const handleBack = () => {
        // After viewing results, go back to course
        const course = courses.find(c => c.id === assessment.courseId);
        if (course) {
            onBackToCourse(course);
        } else {
            // Fallback if course not found (e.g., deleted)
            onBackToCourse(null); // Will be handled by App component
        }
    };

    const associatedCourse = courses.find(c => c.id === assessment.courseId);

    // Handle case where there are no questions
    if (totalQuestions === 0) {
         return (
             <div className="p-4 md:p-8 max-w-4xl mx-auto">
                 <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-200 text-center">
                     <h1 className="text-3xl font-bold text-gray-900 mb-2">{assessment.title}</h1>
                     <p className="text-indigo-700 font-medium mb-6">{assessment.type} for {associatedCourse?.title}</p>
                     <p className="text-lg text-gray-700">This assessment has no questions yet.</p>
                      <button
                         onClick={handleBack}
                         className="mt-6 px-6 py-3 bg-indigo-700 text-white font-semibold rounded-lg hover:bg-indigo-800 transition flex items-center justify-center mx-auto"
                     >
                         <ArrowLeft className="w-5 h-5 mr-2" />
                         Return to Courses
                     </button>
                 </div>
             </div>
         );
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto">
            <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-200">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{assessment.title}</h1>
                <p className="text-indigo-700 font-medium mb-6">{assessment.type} for {associatedCourse?.title}</p>
                
                {!isSubmitted ? (
                    <div className="space-y-6">
                        <div className="text-sm font-semibold text-gray-500">
                            Question {currentQuestionIndex + 1} of {totalQuestions}
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">{question.text}</h2>

                        <div className="space-y-3">
                            {question.options.map((option, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleAnswerSelect(option)}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition duration-200 
                                        ${selectedAnswers[question.id] === option 
                                            ? 'bg-indigo-50 border-indigo-600 text-indigo-800 shadow-md' 
                                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
                                        }`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>

                        <div className="flex justify-between pt-4 border-t border-gray-100">
                            <button
                                onClick={handlePrev}
                                disabled={currentQuestionIndex === 0}
                                    className="px-4 py-2 bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50 hover:bg-gray-300 transition"
                            >
                                Previous
                            </button>
                            {currentQuestionIndex === totalQuestions - 1 ? (
                                <button
                                    onClick={handleSubmit}
                                    disabled={!selectedAnswers[question.id]}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                                >
                                    Submit Final Answers
                                </button>
                            ) : (
                                <button
                                    onClick={handleNext}
                                    disabled={!selectedAnswers[question.id]}
                                    className="px-4 py-2 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 disabled:opacity-50 transition"
                                >
                                    Next Question
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center space-y-6">
                        <h2 className="text-4xl font-extrabold text-indigo-700">Assessment Complete!</h2>
                        <div className={`p-6 rounded-xl inline-block ${score / totalQuestions >= 0.7 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <p className="text-6xl font-black">{score}</p>
                            <p className="text-lg font-semibold">Score out of {totalQuestions}</p>
                        </div>
                        <p className="text-lg text-gray-700">
                            {score / totalQuestions >= 0.7 
                                ? "Congratulations! You passed and mastered the material." 
                                : "You did not pass. Review the lessons and try again!"}
                        </p>
                        <button
                            onClick={handleBack}
                            className="mt-4 px-6 py-3 bg-indigo-700 text-white font-semibold rounded-lg hover:bg-indigo-800 transition flex items-center justify-center mx-auto"
                        >
                            <ArrowLeft className="w-5 h-5 mr-2" />
                            Return to Course
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


/**
 * Renders the list of blog posts.
 */
const BlogHome = ({ blogs, onSelectBlog, adminMode, onEditBlog, onDeleteBlog }) => (
    <div className="p-4 md:p-8 space-y-8">
        <h1 className="text-4xl font-bold text-gray-900 border-b border-gray-200 pb-4">Tech Blog Insights</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map(blog => (
                <div
                    key={blog.id}
                    className="bg-white p-5 rounded-xl shadow-lg border border-gray-200 flex flex-col justify-between"
                >
                    <div>
                        <h2 className="text-xl font-bold text-indigo-700 mb-2 line-clamp-2">{blog.title}</h2>
                        <p className="text-sm text-gray-500 mb-3">By {blog.author} on {blog.date}</p>
                         {/* MODIFIED: Added ql-snow wrapper and overflow-hidden for proper clipping and styling */}
                        <div className="text-sm text-gray-700 mb-4 line-clamp-3 h-16 overflow-hidden ql-snow">
                            <div
                                className="ql-editor" // Content styles
                                dangerouslySetInnerHTML={{ __html: blog.content }}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {blog.tags?.map(tag => (
                                <span key={tag} className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                     <div className="mt-4 pt-3 border-t border-gray-200">
                        {adminMode ? (
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => onEditBlog(blog)}
                                    className="w-full bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition duration-150 shadow-md shadow-indigo-200 flex items-center justify-center cursor-pointer"
                                >
                                    <Edit className="w-4 h-4 mr-2" /> Edit
                                </button>
                                <button
                                    onClick={() => onDeleteBlog(blog.id)}
                                    className="w-full bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 transition duration-150 shadow-md shadow-red-200 flex items-center justify-center cursor-pointer"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => onSelectBlog(blog)}
                                className="w-full bg-indigo-700 text-white font-semibold py-2 rounded-lg hover:bg-indigo-800 transition duration-150 shadow-md shadow-indigo-200 flex items-center justify-center cursor-pointer"
                            >
                                Read More <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

/**
 * Renders a single blog post.
 */
const BlogArticleView = ({ blog, onBackToBlogHome }) => (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <button
            onClick={onBackToBlogHome}
            className="flex items-center text-indigo-700 hover:text-indigo-800 transition mb-6 text-sm md:text-base font-medium p-2 rounded-lg hover:bg-indigo-50"
        >
            <ArrowLeft className="w-5 h-5 mr-2" />
            <span className="font-semibold">Back to Blog List</span>
        </button>
        {/* MODIFIED: Added ql-snow */}
        <div className="bg-white p-6 md:p-10 rounded-xl shadow-lg border border-gray-200 text-gray-900 ql-snow">
            <h1 className="text-4xl font-bold mb-3">{blog.title}</h1>
            <p className="text-gray-500 mb-6 border-b border-gray-200 pb-4">By <span className="font-semibold">{blog.author}</span> on {blog.date}</p>
            
            {/* This div renders the HTML content */}
            <div className="max-w-none text-gray-800 space-y-4 leading-relaxed ql-editor" // MODIFIED: Removed prose
                dangerouslySetInnerHTML={{ __html: blog.content }}
            />
            
            {/* This div MUST be a sibling, not a child */}
            <div className="mt-8 flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                <span className='font-semibold text-sm'>Tags:</span>
                {blog.tags?.map(tag => (
                    <span key={tag} className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    </div>
);

// --- Admin Panel Components ---

/**
 * Utility component for Admin Panel list items.
 */
const AdminListItem = ({ item, onDelete, onEdit, children }) => (
    <div className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center border border-gray-200">
        <div className="flex-1 min-w-0">
            {children}
        </div>
        <div className="flex space-x-2 ml-4">
            <button 
                onClick={() => onEdit(item)}
                className="p-2 text-indigo-700 hover:bg-gray-100 rounded-full transition"
                title="Edit"
            >
                <Edit className="w-5 h-5" />
            </button>
            <button 
                onClick={() => onDelete(item.id)}
                className="p-2 text-red-600 hover:bg-gray-100 rounded-full transition"
                title="Delete"
            >
                <Trash2 className="w-5 h-5" />
            </button>
        </div>
    </div>
);


/**
 * Admin Panel for Course Management (simplified CRUD interface).
 */
const AdminCourseManagement = ({ 
    courses, 
    onCreateCourse, 
    onUpdateCourse, 
    onDeleteCourse, 
    editingCourse, 
    setEditingCourse 
}) => {
    const [formData, setFormData] = useState({});
    
    // --- New State for Editing ---
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [sectionTitleInput, setSectionTitleInput] = useState("");
    
    const [editingLessonId, setEditingLessonId] = useState(null);
    const [showLessonFormForSection, setShowLessonFormForSection] = useState(null); // Holds section.id
    
    const [newSectionTitle, setNewSectionTitle] = useState("");
    const [newLessonTitle, setNewLessonTitle] = useState("");
    const [newLessonContent, setNewLessonContent] = useState("");
    const [newLessonType, setNewLessonType] = useState("richText"); // <-- MODIFICATION: Added lesson type state
    // --- End New State ---


    // Effect to sync form data when editingCourse prop changes
    useEffect(() => {
        if (editingCourse) {
            setFormData({
                ...editingCourse,
                sections: Array.isArray(editingCourse.sections) ? editingCourse.sections : []
            });
            // Reset content forms
            setNewSectionTitle("");
            setShowLessonFormForSection(null);
            setNewLessonTitle("");
            setNewLessonContent("");
            setNewLessonType("richText");
            setEditingSectionId(null);
            setEditingLessonId(null);
        } else {
            setFormData({}); // Clear form when editingCourse is null
        }
    }, [editingCourse]);

    const handleSave = () => {
        if (formData.id) {
            // Update existing course
            onUpdateCourse(formData);
        } else {
            // Create new course
            onCreateCourse(formData, (createdCourse) => {
                // Callback is required by the prop, but we don't
                // need to do anything with createdCourse here.
            });
        }
        setEditingCourse(null); // Clear the editing/creating state
    };

    const handleShowCreateForm = () => {
        const newCourse = {
            title: "",
            description: "",
            duration: "0h 0m",
            level: "Basic",
            iconName: "Zap", // Default icon name
            iconColor: "text-gray-500", // Default icon color
            isPublished: false,
            sections: [],
        };
        setEditingCourse(newCourse); // This will open the form
    };

    // --- New Handlers for Sections and Lessons ---
    
    // --- Section Title Editing ---
    const handleEditSectionTitle = (section) => {
        setEditingSectionId(section.id);
        setSectionTitleInput(section.title);
    };

    const handleCancelEditSectionTitle = () => {
        setEditingSectionId(null);
        setSectionTitleInput("");
    };

    const handleSaveSectionTitle = () => {
        setFormData(prev => ({
            ...prev,
            sections: prev.sections.map(s => 
                s.id === editingSectionId ? { ...s, title: sectionTitleInput } : s
            )
        }));
        setEditingSectionId(null);
        setSectionTitleInput("");
    };
    
    // --- End Section Title Editing ---

    const handleAddNewSection = () => {
        if (!newSectionTitle) return;
        const newSection = {
            id: `s_${Date.now()}`,
            title: newSectionTitle,
            lessons: []
        };
        setFormData(prev => ({
            ...prev,
            sections: Array.isArray(prev.sections) ? [...prev.sections, newSection] : [newSection]
        }));
        setNewSectionTitle("");
    };

    const handleDeleteSection = (sectionId) => {
        setFormData(prev => ({
            ...prev,
            sections: prev.sections.filter(s => s.id !== sectionId)
        }));
    };
    
    // --- Lesson Form Controls ---
    const handleShowAddLessonForm = (sectionId) => {
        setShowLessonFormForSection(sectionId);
        setEditingLessonId(null); // Ensure we are in "add" mode
        setNewLessonTitle("");
        setNewLessonContent("");
        setNewLessonType("richText"); // <-- MODIFICATION: Reset type
    };
    
    const handleShowEditLessonForm = (sectionId, lesson) => {
        setShowLessonFormForSection(sectionId);
        setEditingLessonId(lesson.id); // Ensure we are in "edit" mode
        setNewLessonTitle(lesson.title);
        setNewLessonContent(lesson.content);
        setNewLessonType(lesson.type || "richText"); // <-- MODIFICATION: Set type from lesson
    };

    const handleCancelLessonForm = () => {
        setShowLessonFormForSection(null);
        setEditingLessonId(null);
        setNewLessonTitle("");
        setNewLessonContent("");
        setNewLessonType("richText"); // <-- MODIFICATION: Reset type
    };
    // --- End Lesson Form Controls ---


    const handleSaveLesson = (sectionId) => {
        // MODIFICATION: Check content (which can be URL)
        if (!newLessonTitle || !newLessonContent) { 
            console.warn("Lesson title and content/URL are required.");
            return;
        }
        
        if (editingLessonId) {
            // This is an UPDATE
            setFormData(prev => ({
                ...prev,
                sections: prev.sections.map(s => 
                    s.id === sectionId 
                    ? { ...s, lessons: s.lessons.map(l => 
                            l.id === editingLessonId 
                            // <-- MODIFICATION: Add type to update
                            ? { ...l, title: newLessonTitle, content: newLessonContent, type: newLessonType } 
                            : l
                        )}
                    : s
                )
            }));
        } else {
            // This is an ADD (new lesson)
            // <-- MODIFICATION: Add type to new lesson
            const newLesson = {
                id: `l_${Date.now()}`,
                title: newLessonTitle,
                content: newLessonContent,
                type: newLessonType 
            };
            setFormData(prev => ({
                ...prev,
                sections: prev.sections.map(s => 
                    s.id === sectionId 
                    ? { ...s, lessons: Array.isArray(s.lessons) ? [...s.lessons, newLesson] : [newLesson] }
                    : s
                )
            }));
        }
        
        // Reset form
        handleCancelLessonForm();
    };

    const handleDeleteLesson = (sectionId, lessonId) => {
         setFormData(prev => ({
            ...prev,
            sections: prev.sections.map(s => 
                s.id === sectionId 
                ? { ...s, lessons: s.lessons.filter(l => l.id !== lessonId) }
                : s
            )
        }));
    };
    
    // --- End New Handlers ---

    if (editingCourse) {
        return (
            <div className="space-y-4">
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Editing: {formData.title}</h3>
                
                {/* Simplified Form */}
                <input 
                    type="text"
                    placeholder="Title"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />
                <textarea
                    placeholder="Description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows="3"
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />
                <label className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        checked={formData.isPublished || false}
                        onChange={(e) => setFormData({...formData, isPublished: e.target.checked})}
                        className="rounded text-indigo-700"
                    />
                    <span className="text-gray-700">Published</span>
                </label>
                
                <hr className="my-4 border-gray-200"/>

                {/* --- Course Content Editing --- */}
                <h4 className="text-xl font-semibold text-gray-900">Course Content</h4>
                <div className="space-y-4">
                    {formData.sections?.map(section => (
                        <div key={section.id} className="p-4 border rounded-lg bg-gray-50 space-y-3 border-gray-200">
                            <div className="flex justify-between items-center">
                                {editingSectionId === section.id ? (
                                    <div className="flex-1 flex space-x-2">
                                        <input
                                            type="text"
                                            value={sectionTitleInput}
                                            onChange={(e) => setSectionTitleInput(e.target.value)}
                                            className="flex-1 p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                                            autoFocus
                                        />
                                        <button onClick={handleSaveSectionTitle} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save className="w-4 h-4" /></button>
                                        <button onClick={handleCancelEditSectionTitle} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X className="w-4 h-4" /></button>
                                    </div>
                                ) : (
                                    <h5 className="text-lg font-semibold text-gray-900">{section.title}</h5>
                                )}
                                <div className="flex space-x-1">
                                    {editingSectionId !== section.id && (
                                        <button
                                            onClick={() => handleEditSectionTitle(section)}
                                            className="p-1 text-indigo-700 hover:bg-indigo-100 rounded-full"
                                            title="Edit Section Name"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteSection(section.id)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded-full"
                                        title="Delete Section"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Lessons List */}
                            <div className="space-y-2 pl-4">
                                {section.lessons && section.lessons.length > 0 ? (
                                    section.lessons.map(lesson => (
                                        <div key={lesson.id} className="flex justify-between items-center p-2 border-b border-gray-200">
                                            <p className="text-sm text-gray-700">{lesson.title}</p>
                                            <div className="flex space-x-1">
                                                <button
                                                    onClick={() => handleShowEditLessonForm(section.id, lesson)}
                                                    className="p-1 text-indigo-700 hover:bg-indigo-100 rounded-full"
                                                    title="Edit Lesson"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLesson(section.id, lesson.id)}
                                                    className="p-1 text-red-600 hover:bg-red-100 rounded-full"
                                                    title="Delete Lesson"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No lessons in this section yet.</p>
                                )}
                            </div>
                            
                            {/* Add/Edit Lesson Form (Conditional) */}
                            {showLessonFormForSection === section.id ? (
                                <div className="p-3 bg-white rounded-lg shadow-sm space-y-3">
                                    <h6 className="font-semibold text-sm text-gray-900">
                                        {editingLessonId ? "Editing Lesson" : "New Lesson"}
                                    </h6>
                                    <input
                                        type="text"
                                        placeholder="Lesson Title"
                                        value={newLessonTitle}
                                        onChange={(e) => setNewLessonTitle(e.target.value)}
                                        className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                                    />

                                    {/* --- MODIFICATION: Lesson Type Toggle --- */}
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => setNewLessonType('richText')}
                                            className={`flex-1 p-2 rounded-lg text-sm transition ${newLessonType === 'richText' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                                        >
                                            Rich Text
                                        </button>
                                        <button
                                            onClick={() => setNewLessonType('externalDoc')}
                                            className={`flex-1 p-2 rounded-lg text-sm transition ${newLessonType === 'externalDoc' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                                        >
                                            External Document Link
                                        </button>
                                    </div>

                                    {/* --- MODIFICATION: Conditional Editor/Input --- */}
                                    {newLessonType === 'richText' ? (
                                        <RichTextEditor
                                            value={newLessonContent}
                                            onChange={(content) => setNewLessonContent(content)}
                                        />
                                    ) : (
                                        <input
                                            type="url"
                                            placeholder="https://... (e.g., Google Doc, PDF link)"
                                            value={newLessonContent || ''} // Handle null/undefined
                                            onChange={(e) => setNewLessonContent(e.target.value)}
                                            className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                                        />
                                    )}
                                    {/* --- END MODIFICATION --- */}
                                    
                                    <div className="flex space-x-2 pt-2">
                                        <button
                                            onClick={() => handleSaveLesson(section.id)}
                                            className="flex-1 bg-green-500 text-white p-2 rounded-lg hover:bg-green-600 text-sm"
                                        >
                                            {editingLessonId ? "Update Lesson" : "Save Lesson"}
                                        </button>
                                        <button
                                            onClick={handleCancelLessonForm}
                                            className="flex-1 bg-gray-200 text-gray-800 p-2 rounded-lg hover:bg-gray-300 text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleShowAddLessonForm(section.id)}
                                    className="w-full text-sm flex items-center justify-center p-2 border border-dashed border-indigo-400 text-indigo-700 rounded-lg hover:bg-indigo-50"
                                >
                                    <PlusCircle className="w-4 h-4 mr-2" /> Add New Lesson
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Add New Section Form */}
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            placeholder="New Section Title"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            className="flex-1 p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                        />
                        <button
                            onClick={handleAddNewSection}
                            className="bg-indigo-700 text-white p-3 rounded-lg hover:bg-indigo-800 flex items-center"
                            title="Add Section"
                        >
                            <PlusCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {/* --- End Course Content Editing --- */}

                <div className="flex space-x-3 pt-4 border-t mt-4 border-gray-200">
                    <button onClick={handleSave} className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition flex items-center justify-center">
                        <Save className="w-5 h-5 mr-2" /> Save Changes
                    </button>
                    <button onClick={() => setEditingCourse(null)} className="flex-1 bg-gray-200 text-gray-800 p-3 rounded-lg hover:bg-gray-300 transition flex items-center justify-center">
                        <X className="w-5 h-5 mr-2" /> Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button 
                onClick={handleShowCreateForm}
                className="w-full bg-indigo-700 text-white p-3 rounded-lg hover:bg-indigo-800 transition flex items-center justify-center shadow-md"
            >
                <PlusCircle className="w-5 h-5 mr-2" /> Add New Course
            </button>
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-900 border-gray-200">All Courses ({courses.length})</h3>
            <div className="space-y-3">
                {courses.map(course => (
                    <AdminListItem 
                        key={course.id} 
                        item={course} 
                        onDelete={onDeleteCourse} // Pass the prop down
                        onEdit={setEditingCourse} // Pass setter directly
                    >
                        <div className="font-semibold text-lg text-gray-900">{course.title}</div>
                        <div className={`text-sm ${course.isPublished ? 'text-green-600' : 'text-red-600'}`}>
                            {course.isPublished ? 'Published' : 'Draft'}
                        </div>
                    </AdminListItem>
                ))}
            </div>
        </div>
    );
};


/**
 * Admin Panel for Assessment Management.
 */
const AdminAssessmentManagement = ({ 
    assessments, 
    courses, 
    onCreateAssessment,
    onUpdateAssessment,
    onDeleteAssessment, 
    editingAssessment, 
    setEditingAssessment 
}) => {
    const [formData, setFormData] = useState({});
    const [newQuestion, setNewQuestion] = useState({ text: '', options: ['', '', ''], answer: '' });
    const [showNewQuestionForm, setShowNewQuestionForm] = useState(false);

    useEffect(() => {
        if (editingAssessment) {
            // Ensure questions is always an array
            setFormData({
                ...editingAssessment,
                questions: Array.isArray(editingAssessment.questions) ? editingAssessment.questions : []
            });
            setShowNewQuestionForm(false);
            setNewQuestion({ text: '', options: ['', '', ''], answer: '' });
        } else {
            setFormData({});
        }
    }, [editingAssessment]);

    const handleSave = () => {
        // Filter out empty options before saving
        const cleanedFormData = {
            ...formData,
            questions: formData.questions.map(q => ({
                ...q,
                options: q.options.filter(opt => opt && opt.trim() !== '')
            }))
        };
        
        if (cleanedFormData.id) {
            // Update
            onUpdateAssessment(cleanedFormData);
        } else {
            // Create
            onCreateAssessment(cleanedFormData, (createdAssessment) => {
                // callback
            });
        }
        setEditingAssessment(null);
    };

    const handleShowCreateForm = () => {
        const newAssessment = {
            title: "",
            courseId: courses[0]?.id || null, // Default to first course
            type: "Quiz",
            questions: [], // Start with no questions
        };
        setEditingAssessment(newAssessment);
    };

    const handleDeleteQuestion = (questionId) => {
        setFormData(prevData => ({
            ...prevData,
            questions: prevData.questions.filter(q => q.id !== questionId)
        }));
    };

    const handleOptionChange = (index, value) => {
        const updatedOptions = [...newQuestion.options];
        if(updatedOptions.length <= index) {
            // This handles adding a 4th option
            updatedOptions.push(value);
        } else {
            updatedOptions[index] = value;
        }
        setNewQuestion({ ...newQuestion, options: updatedOptions });
    };

    const handleAddNewQuestion = () => {
        if (!newQuestion.text || !newQuestion.answer) {
            // NOTE: Replaced alert()
            console.warn("Question text and answer are required.");
            return;
        }
        
        const finalOptions = newQuestion.options.filter(opt => opt && opt.trim() !== '');
        
        if (finalOptions.length < 2) {
             console.warn("Please provide at least two options.");
            return;
        }

        if (!finalOptions.includes(newQuestion.answer)) {
            console.warn("The correct answer must match one of the provided options.");
            return;
        }

        const newQ = {
            id: `q_${Date.now()}`, // Simple unique ID
            text: newQuestion.text,
            options: finalOptions,
            answer: newQuestion.answer
        };

        setFormData(prevData => ({
            ...prevData,
            questions: Array.isArray(prevData.questions) ? [...prevData.questions, newQ] : [newQ]
        }));
        
        // Reset form
        setNewQuestion({ text: '', options: ['', '', ''], answer: '' });
        setShowNewQuestionForm(false);
    };

    if (editingAssessment) {
        return (
            <div className="space-y-4">
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Editing: {formData.title}</h3>
                
                <input 
                    type="text"
                    placeholder="Title"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />
                
                <select
                    value={formData.courseId || ''}
                    onChange={(e) => setFormData({...formData, courseId: e.target.value })} // Store Firestore ID as string
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                >
                    <option value="">Select Associated Course</option>
                    {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                </select>

                {/* Question List */}
                <div className="space-y-3 mt-4">
                    <h4 className="text-lg font-semibold border-b pb-2 text-gray-900 border-gray-200">
                        Questions ({formData.questions?.length || 0})
                    </h4>
                    {formData.questions && formData.questions.length > 0 ? (
                        formData.questions.map((q, index) => (
                            <div key={q.id} className="p-3 border rounded-lg bg-gray-50 space-y-2 border-gray-200">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-gray-900">{index + 1}. {q.text}</p>
                                    <button
                                        onClick={() => handleDeleteQuestion(q.id)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded-full"
                                        title="Delete Question"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <ul className="list-disc list-inside ml-4 text-sm text-gray-700">
                                    {q.options.map((opt, i) => (
                                        <li key={i} className={opt === q.answer ? 'font-bold text-green-600' : ''}>
                                            {opt}
                                            {opt === q.answer && <span className="text-xs ml-1">(Correct)</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500 italic">No questions added yet.</p>
                    )}
                </div>

                {/* Add New Question Form Toggle */}
                {!showNewQuestionForm && (
                    <button
                        onClick={() => setShowNewQuestionForm(true)}
                        className="mt-4 w-full flex items-center justify-center p-2 border border-dashed border-indigo-400 text-indigo-700 rounded-lg hover:bg-indigo-50"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" /> Add New Question
                    </button>
                )}

                {/* New Question Form */}
                {showNewQuestionForm && (
                    <div className="p-4 border rounded-lg bg-gray-50 mt-4 space-y-3 border-gray-200">
                        <h5 className="text-md font-semibold text-gray-900">New Question</h5>
                        <input
                            type="text"
                            placeholder="Question Text"
                            value={newQuestion.text}
                            onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                                type="text"
                                placeholder="Option 1"
                                value={newQuestion.options[0]}
                                onChange={(e) => handleOptionChange(0, e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                            />
                            <input
                                type="text"
                                placeholder="Option 2"
                                value={newQuestion.options[1]}
                                onChange={(e) => handleOptionChange(1, e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                            />
                            <input
                                type="text"
                                placeholder="Option 3"
                                value={newQuestion.options[2]}
                                onChange={(e) => handleOptionChange(2, e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                            />
                            <input
                                type="text"
                                placeholder="Option 4 (Optional)"
                                value={newQuestion.options[3] || ''}
                                onChange={(e) => handleOptionChange(3, e.target.value)}
                                className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Correct Answer (must match one option exactly)"
                            value={newQuestion.answer}
                            onChange={(e) => setNewQuestion({ ...newQuestion, answer: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-gray-900 border-gray-300"
                        />
                        <div className="flex space-x-2">
                            <button
                                onClick={handleAddNewQuestion}
                                className="flex-1 bg-green-500 text-white p-2 rounded-lg hover:bg-green-600"
                            >
                                Save Question
                            </button>
                            <button
                                onClick={() => {
                                    setShowNewQuestionForm(false);
                                    setNewQuestion({ text: '', options: ['', '', ''], answer: '' }); // Reset
                                }}
                                className="flex-1 bg-gray-200 text-gray-800 p-2 rounded-lg hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex space-x-3 pt-2">
                    <button onClick={handleSave} className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition flex items-center justify-center">
                        <Save className="w-5 h-5 mr-2" /> Save Changes
                    </button>
                    <button onClick={() => setEditingAssessment(null)} className="flex-1 bg-gray-200 text-gray-800 p-3 rounded-lg hover:bg-gray-300 transition flex items-center justify-center">
                        <X className="w-5 h-5 mr-2" /> Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button 
                onClick={handleShowCreateForm}
                className="w-full bg-indigo-700 text-white p-3 rounded-lg hover:bg-indigo-800 transition flex items-center justify-center shadow-md"
            >
                <PlusCircle className="w-5 h-5 mr-2" /> Add New Assessment
            </button>
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-900 border-gray-200">All Assessments ({assessments.length})</h3>
            <div className="space-y-3">
                {assessments.map(assessment => (
                    <AdminListItem 
                        key={assessment.id} 
                        item={assessment} 
                        onDelete={onDeleteAssessment}
                        onEdit={setEditingAssessment}
                    >
                        <div className="font-semibold text-lg text-gray-900">{assessment.title}</div>
                        <div className="text-sm text-gray-600">
                            Course: {courses.find(c => c.id === assessment.courseId)?.title || "N/A"}
                        </div>
                    </AdminListItem>
                ))}
            </div>
        </div>
    );
};

/**
 * Admin Panel for Blog Management.
 */
const AdminBlogManagement = ({ 
    blogs, 
    onCreateBlog,
    onUpdateBlog,
    onDeleteBlog, 
    editingBlog, 
    setEditingBlog 
}) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (editingBlog) {
            setFormData(editingBlog);
        } else {
            setFormData({});
        }
    }, [editingBlog]);

    const handleSave = () => {
        if (formData.id) {
            // Update
            onUpdateBlog(formData);
        } else {
            // Create
            onCreateBlog(formData, (createdBlog) => {
                // callback
            });
        }
        setEditingBlog(null);
    };

    const handleShowCreateForm = () => {
        const newBlog = {
            title: "",
            author: "Admin",
            date: new Date().toISOString().split('T')[0],
            content: "<p></p>",
            tags: [],
        };
        setEditingBlog(newBlog);
    };

    if (editingBlog) {
        return (
            <div className="space-y-4">
                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Editing: {formData.title}</h3>
                
                <input 
                    type="text"
                    placeholder="Title"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />
                {/* === RICH TEXT EDITOR === */}
                <RichTextEditor
                    value={formData.content || ''}
                    onChange={(content) => setFormData({...formData, content: content})}
                />
                {/* === END RICH TEXT EDITOR === */}
                <input 
                    type="text"
                    placeholder="Author"
                    value={formData.author || ''}
                    onChange={(e) => setFormData({...formData, author: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />
                <input 
                    type="text"
                    placeholder="Tags (comma, separated)"
                    value={Array.isArray(formData.tags) ? formData.tags.join(', ') : ''}
                    onChange={(e) => setFormData({...formData, tags: e.target.value.split(',').map(t => t.trim())})}
                    className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 border-gray-300"
                />

                <div className="flex space-x-3 pt-2">
                    <button onClick={handleSave} className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition flex items-center justify-center">
                        <Save className="w-5 h-5 mr-2" /> Save Changes
                    </button>
                    <button onClick={() => setEditingBlog(null)} className="flex-1 bg-gray-200 text-gray-800 p-3 rounded-lg hover:bg-gray-300 transition flex items-center justify-center">
                        <X className="w-5 h-5 mr-2" /> Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button 
                onClick={handleShowCreateForm}
                className="w-full bg-indigo-700 text-white p-3 rounded-lg hover:bg-indigo-800 transition flex items-center justify-center shadow-md"
            >
                <PlusCircle className="w-5 h-5 mr-2" /> Add New Blog Post
            </button>
            <h3 className="text-xl font-semibold border-b pb-2 text-gray-900 border-gray-200">All Blog Posts ({blogs.length})</h3>
            <div className="space-y-3">
                {blogs.map(blog => (
                    <AdminListItem 
                        key={blog.id} 
                        item={blog} 
                        onDelete={onDeleteBlog}
                        onEdit={setEditingBlog}
                    >
                        <div className="font-semibold text-lg text-gray-900">{blog.title}</div>
                        <div className="text-sm text-gray-600">
                            By {blog.author}
                        </div>
                    </AdminListItem>
                ))}
            </div>
        </div>
    );
};


/**
 * Main Admin Panel container.
 */
const AdminPanel = ({ 
    db, appId, setModal,
    currentAdminView, setCurrentAdminView, // <-- Use props
    courses, 
    onCreateCourse, onUpdateCourse, onDeleteCourse, 
    editingCourse, setEditingCourse,
    
    assessments, 
    onCreateAssessment, onUpdateAssessment, onDeleteAssessment,
    editingAssessment, setEditingAssessment,
    
    blogs, 
    onCreateBlog, onUpdateBlog, onDeleteBlog,
    editingBlog, setEditingBlog
}) => {
    // const [currentAdminView, setCurrentAdminView] = useState(ADMIN_VIEWS.COURSES); // <-- REMOVED THIS
    
    const renderAdminContent = () => {
        switch (currentAdminView) {
            case ADMIN_VIEWS.COURSES:
                return <AdminCourseManagement 
                    courses={courses} 
                    onCreateCourse={onCreateCourse}
                    onUpdateCourse={onUpdateCourse}
                    onDeleteCourse={onDeleteCourse}
                    editingCourse={editingCourse}
                    setEditingCourse={setEditingCourse}
                />;
            case ADMIN_VIEWS.ASSESSMENTS:
                return <AdminAssessmentManagement
                    assessments={assessments}
                    courses={courses}
                    onCreateAssessment={onCreateAssessment}
                    onUpdateAssessment={onUpdateAssessment}
                    onDeleteAssessment={onDeleteAssessment}
                    editingAssessment={editingAssessment}
                    setEditingAssessment={setEditingAssessment}
                />;
            case ADMIN_VIEWS.BLOGS:
                 return <AdminBlogManagement
                    blogs={blogs}
                    onCreateBlog={onCreateBlog}
                    onUpdateBlog={onUpdateBlog}
                    onDeleteBlog={onDeleteBlog}
                    editingBlog={editingBlog}
                    setEditingBlog={setEditingBlog}
                 />;
            case ADMIN_VIEWS.USERS:
                // Simplified view
                return (
                    <div className="text-center p-10 bg-gray-50 rounded-lg">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">User Management</h3>
                        <p className="text-gray-600">Manage user roles and permissions.</p>
                        <div className="text-4xl text-indigo-500 mt-4"><Users className="w-10 h-10 mx-auto" /></div>
                    </div>
                );
            default:
                return null;
        }
    };

    const adminNavItems = [
        { id: ADMIN_VIEWS.COURSES, label: "Courses", icon: BookOpen },
        { id: ADMIN_VIEWS.ASSESSMENTS, label: "Assessments", icon: ClipboardCheck },
        { id: ADMIN_VIEWS.BLOGS, label: "Blog Posts", icon: Feather },
        { id: ADMIN_VIEWS.USERS, label: "Users", icon: Users },
    ];

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center border-b pb-4 border-gray-200">
                <h1 className="text-4xl font-bold text-gray-900 flex items-center">
                    <LayoutDashboard className="w-8 h-8 mr-3 text-indigo-700" /> 
                    Admin Dashboard
                </h1>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Admin Sidebar */}
                <div className="lg:w-64 w-full bg-white p-4 rounded-xl shadow-lg border border-gray-200 flex-shrink-0">
                    <h2 className="text-lg font-bold mb-4 text-gray-700">Content Sections</h2>
                    <div className="space-y-1">
                        {adminNavItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setCurrentAdminView(item.id)} // <-- This now calls the prop
                                className={`flex items-center w-full p-3 rounded-lg transition text-sm font-medium ${
                                    currentAdminView === item.id
                                        ? 'bg-indigo-700 text-white shadow-md'
                                        : 'hover:bg-indigo-50 text-gray-700'
                                }`}
                            >
                                <item.icon className="w-5 h-5 mr-3" />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Admin Content Area */}
                <div className="flex-1 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                    {renderAdminContent()}
                </div>
            </div>
        </div>
    );
};


// --- Main Application Component ---

const App = () => {
  // --- Firebase State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [appId, setAppId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
    
  // --- Application Data State ---
  const [courses, setCourses] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [blogs, setBlogs] = useState([]);

  // --- Navigation State ---
  const [currentPage, setCurrentPage] = useState(APP_VIEWS.HOME); 
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
 
  // --- Admin State ---
  const [adminMode, setAdminMode] = useState(() => {
    try {
      return sessionStorage.getItem('adminLoggedIn') === 'true';
    } catch (e) { return false; }
  });
 
  // --- Modal State ---
  const [modal, setModal] = useState(null);
  const [showSecretCodeModal, setShowSecretCodeModal] = useState(false);
  const [currentAdminView, setCurrentAdminView] = useState(ADMIN_VIEWS.COURSES); // <-- ADDED THIS

  // --- Admin Editing State ---
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [editingBlog, setEditingBlog] = useState(null);

  // --- Collection Refs ---
  const getCollectionRef = (collectionName) => {
       if (!db || !appId) return null;
       // Use the public data path structure
       return collection(db, 'artifacts', appId, 'public', 'data', collectionName);
    };

  // --- Firebase Initialization and Auth Effect ---
  useEffect(() => {
    // Enable Firestore logging
    try {
        setLogLevel('debug');
    } catch (e) {
        console.error("Firebase logging setup failed:", e);
    }
    
    // Load Quill/Highlight CSS globally
    loadStylesheet(QUILL_CSS_URL);
    loadStylesheet(HIGHLIGHT_CSS_URL);

    // --- (MODIFICATION) Load config from Vite environment variables ---
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    };

    // Basic validation
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
        const errorMsg = "Firebase configuration is missing or invalid. Make sure all VITE_FIREBASE_ variables are set in your .env file.";
        console.error(errorMsg);
        setModal({ title: "Config Error", message: errorMsg, type: 'error' });
        return; // Stop initialization
    }
    
    // Set the App ID state from the config
    setAppId(firebaseConfig.appId);
    // --- END MODIFICATION ---

    // Initialize Firebase
    try {
        const app = initializeApp(firebaseConfig);
        // const analytics = getAnalytics(app); // Removed, not used
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        // --- Auth Listener ---
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                // User is signed in
                setUserId(user.uid);
                setIsAuthReady(true);
                console.log("Firebase user signed in:", user.uid);
            } else {
                // User is signed out or not yet signed in
                console.log("Firebase user not signed in. Attempting auth...");
                try {
                    // NOTE: The original code had a check for `__initial_auth_token`.
                    // This is removed in favor of anonymous sign-in for a local dev setup.
                    // If you need custom token auth, you'll need a different mechanism.
                    console.log("Signing in anonymously...");
                    await signInAnonymously(firebaseAuth);
                } catch (authError) {
                    console.error("Firebase auth error:", authError);
                    setModal({ title: "Auth Error", message: `Failed to authenticate: ${authError.message}`, type: 'error' });
                }
            }
        });
        
        return () => unsubscribe(); // Cleanup auth listener on unmount

    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setModal({ title: "Init Error", message: `Failed to initialize application: ${e.message}` });
    }
  }, []); // Empty dependency array ensures this runs only once

  // --- Firestore Data Listener Effect ---
  useEffect(() => {
    // Wait until auth is ready and db/appId are set
    if (!isAuthReady || !db || !appId) {
        if (!isAuthReady) console.log("Firestore listeners waiting for auth...");
        if (!db) console.log("Firestore listeners waiting for db...");
        if (!appId) console.log("Firestore listeners waiting for appId...");
        return;
    }
    
    console.log("Auth ready. Setting up Firestore listeners...");

    // Helper to create snapshot listener
    const createListener = (collectionName, setter) => {
      const collRef = getCollectionRef(collectionName);
      if (!collRef) {
        console.error(`Failed to get collection ref for ${collectionName}`);
        return () => {}; // Return empty unsub function
      }

      console.log(`Attaching listener to: ${collRef.path}`);
      const unsubscribe = onSnapshot(query(collRef), (querySnapshot) => {
        const dataList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setter(dataList);
        console.log(`Firestore data loaded for ${collectionName}:`, dataList.length, "items");
      }, (error) => {
        console.error(`Firestore error on ${collectionName}:`, error);
        // Display the error to the user
        setModal({ title: "Data Error", message: `Failed to load ${collectionName}. ${error.message}`, type: 'error' });
      });
      return unsubscribe;
    };

    // Create listeners for all collections
    const unsubCourses = createListener('courses', setCourses);
    const unsubAssessments = createListener('assessments', setAssessments);
    const unsubBlogs = createListener('blogs', setBlogs);

    // Return cleanup function
    return () => {
      console.log("Cleaning up Firestore listeners...");
      unsubCourses();
      unsubAssessments();
      unsubBlogs();
    };
  }, [isAuthReady, db, appId]); // Dependencies for setting up listeners


  // --- Navigation Handlers ---
  
  const navigateTo = (page) => {
    setCurrentPage(page);
    setIsSidebarOpen(false);
  };

  const handleGoHome = () => {
    setSelectedCourse(null);
    setSelectedLesson(null);
    setSelectedAssessment(null);
    setSelectedBlog(null);
    navigateTo(APP_VIEWS.HOME);
  };
  
  const handleGoToBlogHome = () => {
    setSelectedBlog(null);
    navigateTo(APP_VIEWS.BLOG_HOME);
  };
  
  const handleGoToAssessmentHome = () => {
    setSelectedAssessment(null);
    navigateTo(APP_VIEWS.ASSESSMENT_HOME);
  };

  const handleSelectCourse = (course) => {
    setSelectedCourse(course);
    navigateTo(APP_VIEWS.COURSE_DETAIL);
  };

  const handleSelectLesson = (course, lesson) => {
    setSelectedCourse(course);
    setSelectedLesson(lesson);
    navigateTo(APP_VIEWS.ARTICLE_VIEW);
  };

  const handleStartAssessment = (assessmentId) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    if (assessment) {
        setSelectedAssessment(assessment);
        navigateTo(APP_VIEWS.ASSESSMENT_VIEW);
    } else {
        setModal({ title: "Error", message: "Assessment not found!", type: 'error' });
    }
  };

  const handleBackToCourse = (course) => {
    setSelectedLesson(null);
    setSelectedAssessment(null);
    if(course) {
        setSelectedCourse(course);
        navigateTo(APP_VIEWS.COURSE_DETAIL);
    } else {
        handleGoHome(); // Fallback if course is null (e.g., deleted)
    }
  };

  const handleSelectBlog = (blog) => {
    setSelectedBlog(blog);
    navigateTo(APP_VIEWS.BLOG_ARTICLE);
  };
  
  // --- Auth Handlers ---
  
  const handleGoToAdminLogin = () => {
    setShowSecretCodeModal(true);
  };

  const handleSecretCodeSubmit = (code) => {
    // This is a simple, insecure check.
    // A real app would use custom claims or a user role in Firestore.
    if (code === '123') {
      setAdminMode(true);
      try {
        sessionStorage.setItem('adminLoggedIn', 'true');
      } catch (e) { console.error("Could not write to sessionStorage", e); }
      setShowSecretCodeModal(false);
      navigateTo(APP_VIEWS.ADMIN_PANEL);
    } else {
      setShowSecretCodeModal(false); 
      setModal({ title: "Access Denied", message: "The secret code is incorrect.", type: 'error' });
    }
  };
  
  const handleLogout = () => {
    setAdminMode(false);
    try {
      sessionStorage.removeItem('adminLoggedIn');
    } catch (e) { console.error("Could not remove from sessionStorage", e); }
    handleGoHome(); // Go back to user home
  };
  

  // --- Firestore C-U-D Functions ---

  const getDocRef = (collectionName, id) => {
       if (!db || !appId) return null;
       return doc(db, 'artifacts', appId, 'public', 'data', collectionName, id);
  }
  
  // --- Courses ---
  const handleCreateCourse = async (courseData, callback) => {
      const collRef = getCollectionRef('courses');
      if (!collRef) return;
      try {
          const docRef = await addDoc(collRef, courseData);
         setModal({ title: "Success", message: "Course created!", type: 'success' });
          callback({ ...courseData, id: docRef.id }); // Pass new doc back
      } catch (e) {
          console.error("Error creating course:", e);
          setModal({ title: "Error", message: `Failed to create course: ${e.message}`, type: 'error' });
      }
  };
  
  const handleUpdateCourse = async (courseData) => {
      const docRef = getDocRef('courses', courseData.id);
      if (!docRef) return;
      const { id, ...dataToUpdate } = courseData; // Don't save ID inside the doc
      try {
          await setDoc(docRef, dataToUpdate);
          setModal({ title: "Success", message: "Course updated!", type: 'success' });
      } catch (e) {
          console.error("Error updating course:", e);
          setModal({ title: "Error", message: `Failed to update course: ${e.message}`, type: 'error' });
      }
  };

  const handleDeleteCourse = async (id) => {
      const docRef = getDocRef('courses', id);
      if (!docRef) return;
      try {
          await deleteDoc(docRef);
          setModal({ title: "Success", message: "Course deleted.", type: 'success' });
      } catch (e) {
          console.error("Error deleting course:", e);
          setModal({ title: "Error", message: `Failed to delete course: ${e.message}`, type: 'error' });
      }
  };

  // --- Assessments ---
   const handleCreateAssessment = async (assessmentData, callback) => {
      const collRef = getCollectionRef('assessments');
      if (!collRef) return;
      try {
          const docRef = await addDoc(collRef, assessmentData);
          setModal({ title: "Success", message: "Assessment created!", type: 'success' });
          callback({ ...assessmentData, id: docRef.id });
      } catch (e) {
          console.error("Error creating assessment:", e);
          setModal({ title: "Error", message: `Failed to create assessment: ${e.message}`, type: 'error' });
      }
  };
  
  const handleUpdateAssessment = async (assessmentData) => {
      const docRef = getDocRef('assessments', assessmentData.id);
      if (!docRef) return;
      const { id, ...dataToUpdate } = assessmentData;
      try {
          await setDoc(docRef, dataToUpdate);
          setModal({ title: "Success", message: "Assessment updated!", type: 'success' });
      } catch (e) {
          console.error("Error updating assessment:", e);
          setModal({ title: "Error", message: `Failed to update assessment: ${e.message}`, type: 'error' });
      }
  };

  const handleDeleteAssessment = async (id) => {
      const docRef = getDocRef('assessments', id);
      if (!docRef) return;
      try {
          await deleteDoc(docRef);
          setModal({ title: "Success", message: "Assessment deleted.", type: 'success' });
      } catch (e) {
          console.error("Error deleting assessment:", e);
          setModal({ title: "Error", message: `Failed to delete assessment: ${e.message}`, type: 'error' });
      }
  };

  // --- Blogs ---
  const handleCreateBlog = async (blogData, callback) => {
      const collRef = getCollectionRef('blogs');
      if (!collRef) return;
      try {
          const docRef = await addDoc(collRef, blogData);
          setModal({ title: "Success", message: "Blog post created!", type: 'success' });
          callback({ ...blogData, id: docRef.id });
      } catch (e) {
          console.error("Error creating blog post:", e);
          setModal({ title: "Error", message: `Failed to create blog post: ${e.message}`, type: 'error' });
      }
  };
  
  const handleUpdateBlog = async (blogData) => {
      const docRef = getDocRef('blogs', blogData.id);
      if (!docRef) return;
      const { id, ...dataToUpdate } = blogData;
      try {
          await setDoc(docRef, dataToUpdate);
          setModal({ title: "Success", message: "Blog post updated!", type: 'success' });
      } catch (e) {
          console.error("Error updating blog post:", e);
          setModal({ title: "Error", message: `Failed to update blog post: ${e.message}`, type: 'error' });
      }
  };

  const handleDeleteBlog = async (id) => {
      const docRef = getDocRef('blogs', id);
      if (!docRef) return;
      try {
          await deleteDoc(docRef);
          setModal({ title: "Success", message: "Blog post deleted.", type: 'success' });
      } catch (e) {
          console.error("Error deleting blog post:", e);
          setModal({ title: "Error", message: `Failed to delete blog post: ${e.message}`, type: 'error' });
      }
  };

  
  // --- Admin Edit State Handlers ---
  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setCurrentAdminView(ADMIN_VIEWS.COURSES); // <-- ADDED THIS
    navigateTo(APP_VIEWS.ADMIN_PANEL); 
  };
  
  const handleEditAssessment = (assessment) => {
    setEditingAssessment(assessment);
    setCurrentAdminView(ADMIN_VIEWS.ASSESSMENTS); // <-- ADDED THIS
    navigateTo(APP_VIEWS.ADMIN_PANEL); 
  };
  
  const handleEditBlog = (blog) => {
    setEditingBlog(blog);
    setCurrentAdminView(ADMIN_VIEWS.BLOGS); // <-- ADDED THIS
    navigateTo(APP_VIEWS.ADMIN_PANEL);
  };


  const renderContent = () => {
    if (!isAuthReady) {
        return (
            <div className="w-full h-screen flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <Globe className="w-16 h-16 text-indigo-600 animate-spin" />
                    <h2 className="text-xl font-semibold text-gray-700 mt-4">Connecting to Learning Hub...</h2>
                    <p className="text-sm text-gray-500 mt-2">Initializing services...</p>
                </div>
            </div>
        );
    }
        
    if (adminMode && currentPage === APP_VIEWS.ADMIN_PANEL) {
        return <AdminPanel 
            db={db} appId={appId} setModal={setModal}
            currentAdminView={currentAdminView} // <-- Pass state down
            setCurrentAdminView={setCurrentAdminView} // <-- Pass setter down
            
            courses={courses} 
            onCreateCourse={handleCreateCourse}
            onUpdateCourse={handleUpdateCourse}
            onDeleteCourse={handleDeleteCourse} 
            editingCourse={editingCourse} 
            setEditingCourse={setEditingCourse}
            
            assessments={assessments} 
            onCreateAssessment={handleCreateAssessment}
            onUpdateAssessment={handleUpdateAssessment}
            onDeleteAssessment={handleDeleteAssessment}
            editingAssessment={editingAssessment} 
            setEditingAssessment={setEditingAssessment}
            
            blogs={blogs} 
            onCreateBlog={handleCreateBlog}
            onUpdateBlog={handleUpdateBlog}
            onDeleteBlog={handleDeleteBlog}
            editingBlog={editingBlog} 
            setEditingBlog={setEditingBlog}
        />;
    }

    switch (currentPage) {
      case APP_VIEWS.COURSE_DETAIL:
        if (!selectedCourse) {
            return <HomeView onSelectCourse={handleSelectCourse} courses={courses} onNavigate={navigateTo} adminMode={adminMode} onEditCourse={handleEditCourse} onDeleteCourse={handleDeleteCourse} />;
        }
        return <CourseDetailView course={selectedCourse} onSelectLesson={handleSelectLesson} onGoHome={handleGoHome} onStartAssessment={handleStartAssessment} />;
      
      case APP_VIEWS.ARTICLE_VIEW:
        if (!selectedLesson || !selectedCourse) {
             return <HomeView onSelectCourse={handleSelectCourse} courses={courses} onNavigate={navigateTo} adminMode={adminMode} onEditCourse={handleEditCourse} onDeleteCourse={handleDeleteCourse} />;
        }
        return <ArticleView lesson={selectedLesson} course={selectedCourse} onBackToCourse={handleBackToCourse} />;
      
      case APP_VIEWS.ASSESSMENT_HOME:
        return <AssessmentHome 
            assessments={assessments} 
            onStartAssessment={handleStartAssessment} 
            courses={courses} 
            adminMode={adminMode}
            onEditAssessment={handleEditAssessment}
            onDeleteAssessment={handleDeleteAssessment}
        />;

      case APP_VIEWS.ASSESSMENT_VIEW:
        if (!selectedAssessment) {
            return <AssessmentHome assessments={assessments} onStartAssessment={handleStartAssessment} courses={courses} adminMode={adminMode} onEditAssessment={handleEditAssessment} onDeleteAssessment={handleDeleteAssessment} />;
        }
        return <AssessmentView assessment={selectedAssessment} onAssessmentComplete={() => {}} onBackToCourse={handleBackToCourse} courses={courses} />;
      
      case APP_VIEWS.BLOG_HOME:
        return <BlogHome 
            blogs={blogs} 
            onSelectBlog={handleSelectBlog} 
            adminMode={adminMode}
            onEditBlog={handleEditBlog}
            onDeleteBlog={handleDeleteBlog}
        />;
      
      case APP_VIEWS.BLOG_ARTICLE:
        if (!selectedBlog) {
            return <BlogHome blogs={blogs} onSelectBlog={handleSelectBlog} adminMode={adminMode} onEditBlog={handleEditBlog} onDeleteBlog={handleDeleteBlog} />;
        }
        return <BlogArticleView blog={selectedBlog} onBackToBlogHome={handleGoToBlogHome} />;
      
      case APP_VIEWS.HOME:
      default:
        return <HomeView 
            onSelectCourse={handleSelectCourse} 
            courses={courses} 
            onNavigate={navigateTo} 
            adminMode={adminMode}
            onEditCourse={handleEditCourse}
            onDeleteCourse={handleDeleteCourse}
        />;
    }
  };

  // Sidebar component for navigation
  const Sidebar = () => (
    <div className="w-56 bg-white text-gray-800 p-4 h-full flex flex-col space-y-4 shadow-xl border-r border-gray-200">
      
      {/* Logo/Title */}
      <button 
        onClick={handleGoHome} 
        className="text-2xl font-extrabold text-indigo-700 flex items-center mb-4 hover:text-indigo-800 transition p-1 rounded-md"
      >
        <Globe className="w-6 h-6 mr-1"/> Learning Hub
      </button>

      <div className="h-px bg-gray-200 my-2"></div>
      
      {/* Navigation Links */}
      <div className="flex flex-col space-y-1">
        <SidebarNavButton 
            icon={BookOpen} 
            label="Courses" 
            isActive={currentPage === APP_VIEWS.HOME || currentPage === APP_VIEWS.COURSE_DETAIL || currentPage === APP_VIEWS.ARTICLE_VIEW} 
            onClick={handleGoHome}
        />
        <SidebarNavButton 
            icon={ClipboardCheck} 
            label="Assessments" 
            isActive={currentPage === APP_VIEWS.ASSESSMENT_HOME || currentPage === APP_VIEWS.ASSESSMENT_VIEW} 
            onClick={handleGoToAssessmentHome}
        />
        <SidebarNavButton 
            icon={Feather} 
            label="Blog" 
            isActive={currentPage === APP_VIEWS.BLOG_HOME || currentPage === APP_VIEWS.BLOG_ARTICLE} 
            onClick={handleGoToBlogHome}
        />
      </div>

      <div className="h-px bg-gray-200 my-2"></div>

      {/* Admin/User Toggle */}
      <div className="pt-2">
        {adminMode ? (
            <>
                <h3 className='text-xs font-bold text-red-500 mb-2 uppercase tracking-wider'>Admin Tools</h3>
                <SidebarNavButton 
                    icon={LayoutDashboard} 
                    label="Dashboard" 
                    isActive={currentPage === APP_VIEWS.ADMIN_PANEL} 
                    onClick={() => navigateTo(APP_VIEWS.ADMIN_PANEL)}
                />
                <SidebarNavButton 
                    icon={User} 
                    label="Logout" 
                    isActive={false} 
                    onClick={handleLogout}
                />
            </>
        ) : (
            <SidebarNavButton 
                icon={Settings} 
                label="Admin Login" 
                isActive={false} 
                onClick={handleGoToAdminLogin}
            />
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex font-inter text-gray-800">

      {/* Modal Overlay */}
      {modal && <CustomModal title={modal.title} message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {/* Secret Code Modal */}
      {showSecretCodeModal && (
        <SecretCodeModal
          onSubmit={handleSecretCodeSubmit}
          onClose={() => setShowSecretCodeModal(false)}
        />
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Desktop Sidebar (Fixed width) */}
      <div className="hidden md:block w-56 flex-shrink-0">
        <div className="fixed top-0 left-0 h-screen overflow-y-auto w-56">
          <Sidebar />
        </div>
      </div>

      {/* Mobile Sidebar (Slide-out) */}
      <div className={`fixed top-0 left-0 h-full w-56 z-50 transform transition-transform duration-300 ease-in-out md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto">

        {/* Header/Nav for Mobile */}
        <header className="md:hidden bg-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-30 border-b border-gray-200">
          <button onClick={() => setIsSidebarOpen(true)} className="text-gray-700 p-1 rounded-md hover:bg-gray-100 transition">
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold text-indigo-700">Learning Hub</span>
          <Search className="w-6 h-6 text-gray-500"/>
        </header>

        {/* Content */}
        <main className="w-full max-w-7xl mx-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;