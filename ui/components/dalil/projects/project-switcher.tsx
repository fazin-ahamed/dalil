"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RiAddLine, RiCheckLine, RiDeleteBinLine, RiFolderLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { HintTrigger } from "@/components/dalil/setup/hint-trigger";
import { fill } from "@/components/dalil/setup/setup-copy";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import type { Project } from "@/lib/contracts";
import copy from "@/lib/copy.json";
import { activeProject, nameProblem, shortFolder, type NameProblem } from "@/lib/projects";
import { cx } from "@/utils/cx";

const strings = copy.projects.switcher;

/** Focus ring offset that matches the night glass ground instead of BoardUI's white. */
const RING = "ring-offset-background-full";

/** Grows a 32px icon button to a 44px hit area without changing how it looks. */
const HIT_44 = "relative overflow-visible after:absolute after:-inset-1.5 after:content-['']";

/** Quiet icon button on night glass: no fill until it is hovered. */
const QUIET = "bg-transparent text-foreground-icon-secondary hover:bg-background-tertiary-default hover:text-foreground-icon-primary active:bg-background-tertiary-hover";

/** The button that shows the project in use and opens the menu. */
const TRIGGER =
  "flex min-w-0 max-w-full items-center gap-2 self-start rounded-2lg border border-border-button-default bg-background-primary-default px-2.5 py-2 text-body-medium text-text-primary shadow-xs ring-offset-background-full hover:border-border-button-hover hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring";

const NAME_ERRORS: Record<NameProblem, string> = {
  "empty-name": strings.errors.empty,
  "name-too-long": strings.errors.long,
  duplicate: strings.errors.duplicate,
};

export interface ProjectSwitcherProps {
  /** Every project, in the order they were made. */
  projects: Project[];
  inline?: boolean;
  /** The project in use, or null for none. */
  activeId: string | null;
  /** Makes a project the one in use, or none for null. The menu closes after a pick. */
  onSelect(id: string | null): void;
  /** Adds a project. The caller makes it the one in use. The menu closes after an add. */
  onAdd(name: string, folder?: string): void;
  /** Deletes a project. Its lessons stay. */
  onDelete(id: string): void;
}

/** The word next to the tick, so the project in use is marked by more than colour or an icon. */
function ActiveMark() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-caption-1-medium text-text-secondary">
      <RiCheckLine className="size-3.5 text-foreground-icon-primary" aria-hidden />
      {strings.active}
    </span>
  );
}

/**
 * The project switcher: a button that shows the project in use, and a menu with "No project", every
 * project (with a delete button each) and a form for a new one. It draws the projects it is given and
 * reports every change through its callbacks.
 */
export function ProjectSwitcher({ projects, activeId, onSelect, onAdd, onDelete, inline = false }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [tried, setTried] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const landing = useRef(false);
  const active = activeProject({ projects, active: activeId });

  /* A deleted row takes its button with it, so focus moves to the first row instead of the page. */
  useEffect(() => {
    if (!landing.current) return;
    landing.current = false;
    listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [projects]);

  const problem = nameProblem(name, projects);
  /* Errors appear once something is typed or the form was sent, so an empty form starts quiet. */
  const shown = problem && (tried || name.length > 0) ? problem : null;

  const pick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  const remove = (id: string) => {
    landing.current = true;
    onDelete(id);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (nameProblem(name, projects)) return;
    onAdd(name.trim(), folder.trim() || undefined);
    setName("");
    setFolder("");
    setTried(false);
    setOpen(false);
  };

  const content = <>
        <div ref={listRef} className="flex w-full flex-col gap-1">
          <DropdownItem selected={activeId === null} onSelect={() => pick(null)}>
            <span className="min-w-0 flex-1 truncate text-body-medium">{strings.none}</span>
            {activeId === null ? <ActiveMark /> : null}
          </DropdownItem>
          {projects.length === 0 ? <p className="px-2 py-1.5 text-body-regular text-text-secondary">{strings.empty}</p> : null}
          {projects.map((project) => {
            const selected = project.id === activeId;
            return (
              <div key={project.id} className="flex w-full items-center gap-1">
                <DropdownItem selected={selected} onSelect={() => pick(project.id)} className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-medium">{project.name}</span>
                    {project.folder ? (
                      <span className="truncate text-caption-1-regular text-text-tertiary">{shortFolder(project.folder)}</span>
                    ) : null}
                  </span>
                  {selected ? <ActiveMark /> : null}
                </DropdownItem>
                <HintTrigger label={strings.delete_tip} placement="bottom end">
                  <Button
                    variant="ghost"
                    size="small"
                    iconOnly
                    leadingIcon={RiDeleteBinLine}
                    aria-label={fill(strings.delete, { name: project.name })}
                    onClick={() => remove(project.id)}
                    className={cx(HIT_44, QUIET, RING)}
                  />
                </HintTrigger>
              </div>
            );
          })}
        </div>

        <DropdownDivider />

        <DropdownGroup label={strings.new_heading}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-2.5 px-1 pb-1">
            <Input
              label={strings.name_label}
              placeholder={strings.name_placeholder}
              value={name}
              onChange={setName}
              isInvalid={shown !== null}
              errorMessage={shown ? NAME_ERRORS[shown] : undefined}
            />
            <Input
              label={strings.folder_label}
              placeholder={inline ? "C:\\Users\\you\\Documents\\Project" : strings.folder_placeholder}
              value={folder}
              onChange={setFolder}
              inputDir="ltr"
            />
            <Button type="submit" variant="secondary" size="small" leadingIcon={RiAddLine} className={RING}>
              {strings.add}
            </Button>
          </form>
        </DropdownGroup>
  </>;
  if (inline) return <div className="flex flex-col gap-3">{content}</div>;

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger className={TRIGGER}>
        <RiFolderLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="min-w-0 truncate">{active ? active.name : strings.none}</span>
        <ChevronDownSmall
          className={cx("size-4 shrink-0 text-text-secondary transition-transform duration-200", open && "rotate-180")}
        />
      </DropdownTrigger>
      {/* The popover is portalled out of the notch, so the night glass class goes on the popover itself. */}
      <DropdownPopover aria-label={strings.menu} className="dark w-72">
        {content}
      </DropdownPopover>
    </Dropdown>
  );
}
