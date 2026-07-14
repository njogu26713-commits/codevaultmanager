import * as React from "react";
import { FileNode } from "@workspace/api-client-react";
import { Folder, FolderOpen, FileCode2, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  nodes: FileNode[];
  onSelectFile: (path: string) => void;
  selectedPath?: string;
  className?: string;
}

export function FileTree({ nodes, onSelectFile, selectedPath, className }: FileTreeProps) {
  return (
    <div className={cn("text-sm font-mono", className)}>
      {nodes.map(node => (
        <FileTreeNode 
          key={node.path} 
          node={node} 
          onSelectFile={onSelectFile} 
          selectedPath={selectedPath} 
        />
      ))}
    </div>
  );
}

function FileTreeNode({ 
  node, 
  onSelectFile, 
  selectedPath, 
  depth = 0 
}: { 
  node: FileNode; 
  onSelectFile: (path: string) => void; 
  selectedPath?: string;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = React.useState(depth < 2); // Auto-open first few levels
  
  const isSelected = selectedPath === node.path;
  const isDir = node.type === 'dir';

  if (isDir) {
    return (
      <div>
        <div 
          className="flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-muted/50 rounded-md select-none group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-blue-400" />
          ) : (
            <Folder className="w-4 h-4 text-blue-400" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        
        {isOpen && node.children && (
          <div>
            {node.children.map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                onSelectFile={onSelectFile} 
                selectedPath={selectedPath}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded-md select-none transition-colors group",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <FileCode2 className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
      <span className="truncate">{node.name}</span>
    </div>
  );
}
